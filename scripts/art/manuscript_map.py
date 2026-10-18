"""
Atlas a partir do mapa ilustrado do manuscrito (Edição Profissional Ilustrada).

  python3 scripts/art/manuscript_map.py           # gera tudo
  python3 scripts/art/manuscript_map.py --previa  # também salva conferências em .preview/

Fonte: scripts/art/fontes/mapa-manuscrito-cor.webp (1536 × 1024).
Produz:
  - public/images/atlas/mapa-mundo-original.webp   (a carta do manuscrito, como foi desenhada)
  - public/images/atlas/mapa-mundo-conhecido.webp  (versão oficial: Safra em branco)
  - public/images/atlas/mascara-terra.png          (terra = branco)
  - public/images/atlas/relevo-mundo.png           (altura 16 bits em R+G, para o 3D)
  - public/images/atlas/relevo-mundo-conhecido.png (o mesmo relevo, com Safra plana e sem registro)
  - src/data/atlas/world.json                       (regiões dos seis reinos, traçadas sobre a carta)
  - public/images/atlas/carta/<reino>.webp          (detalhe de cada reino na carta, com a região em destaque)

As cartelas do original (título, quadro "O mundo conhecido", legenda,
encartes e escala) são mantidas; no relevo 3D elas ficam planas, sobre o mar,
como cartelas impressas numa maquete. Nomes, capitais e fronteiras são os do
mapa — conceituais e sujeitos a revisão.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from artlib import F, Noise, blur, smoothstep

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SRC = HERE / 'fontes' / 'mapa-manuscrito-cor.webp'
OUT = ROOT / 'public' / 'images' / 'atlas'
DATA = ROOT / 'src' / 'data' / 'atlas' / 'world.json'
PREVIEW = HERE / '.preview'

W, H = 1536, 1024

# Cartelas do original (sem relevo): (x0, y0, x1, y1) em pixels da carta
BOXES = {
    'titulo': (14, 0, 552, 80),
    'quadro': (1176, 0, 1536, 172),
    'legenda': (4, 660, 250, 1024),
    'encartes': (943, 722, 1536, 1024),
    'escala': (268, 946, 556, 1024),
}

# Rosa dos ventos (ornamento sobre o mar, sem relevo)
COMPASS = (38, 88, 152, 218)

# Cartela com o nome de Nácaris, que fica sobre a costa: conta como terra
NACARIS_LABEL = (232, 392, 368, 452)

# Tarjas com nomes e capitais desenhadas sobre a terra (planas no relevo)
NAME_PLATES = [
    (282, 238, 400, 280), (338, 300, 432, 345),  # Aurelion, Auréstria
    (544, 228, 640, 268), (582, 262, 668, 300),  # Elyndor, Ithária
    (806, 250, 924, 292), (835, 306, 912, 340),  # Rhovaryn, Avarra
    (390, 425, 485, 487), (500, 450, 580, 480), (528, 388, 588, 448),  # Safra, Templo
    (760, 428, 868, 470), (800, 478, 880, 512),  # Kharveth, Vhaldris
    (205, 360, 345, 400),  # Velária
    (460, 64, 600, 104), (770, 118, 915, 182), (1000, 185, 1125, 230),  # Terras do Norte, Montanhas Eternas, Além das Montanhas
]

# Cordilheiras pintadas na carta: (polígono em pixels, tipo de pintura, força).
# Dentro de cada zona, a altura vem do próprio desenho: em "rocha" os picos são
# as faces iluminadas e a neve (claras); em "vulcao" (Safra) os picos são a
# rocha escura, e os rios de lava, o fundo dos vales. Fora das zonas, não há montanhas.
MOUNTAINS = [
    # Terras do Norte, Montanhas Eternas e a crista ao norte de Aurelion
    ([(185, 95), (300, 80), (380, 50), (470, 25), (560, 18), (700, 12), (820, 18), (960, 28), (1060, 60), (1150, 110), (1230, 160), (1262, 230), (1240, 292), (1170, 292), (1080, 272), (1000, 252), (930, 232), (880, 202), (820, 177), (760, 166), (700, 160), (640, 152), (580, 166), (520, 172), (460, 162), (400, 152), (330, 162), (260, 162), (200, 142)], 'rocha', 1.0),
    # Além das Montanhas
    ([(1240, 200), (1330, 215), (1420, 260), (1480, 330), (1492, 420), (1472, 500), (1422, 572), (1372, 572), (1350, 500), (1330, 430), (1300, 360), (1260, 300)], 'rocha', 0.8),
    # Kharveth
    ([(938, 468), (1010, 468), (1100, 498), (1180, 518), (1250, 558), (1312, 588), (1327, 650), (1322, 720), (1302, 746), (958, 746), (944, 690), (950, 600), (934, 520)], 'rocha', 0.95),
    # serra entre Elyndor, Safra e Kharveth
    ([(878, 378), (950, 368), (1012, 418), (1004, 482), (942, 502), (898, 472)], 'rocha', 0.8),
    # Safra: picos vulcânicos entre rios de lava (o nome usa o polígono da região)
    ('safra', 'vulcao', 0.95),
    # ilhas montanhosas do sul
    ([(200, 788), (330, 783), (480, 818), (560, 848), (560, 906), (200, 906)], 'rocha', 0.6),
    ([(630, 828), (760, 818), (900, 788), (952, 818), (952, 906), (630, 906)], 'rocha', 0.6),
]

# Alturas na escala do relevo exportado: o maciço de cada cordilheira e os
# picos pintados por cima dele (os picos são estreitos; mais altos, viram agulhas)
MASSIF_HEIGHT = 0.30
PEAK_HEIGHT = 0.13

# Faixa de nuvens ao pé da carta (sem relevo)
FOG_BAND_Y = 905

# Regiões traçadas sobre a carta (pixels). Os polígonos incluem um pouco de
# água na costa: o site recorta tudo pela máscara de terra.
REGIONS_PX = {
    'safra': [(700, 455), (750, 457), (790, 460), (830, 467), (855, 485), (880, 515), (905, 530), (918, 560), (922, 595), (917, 630), (897, 660), (870, 695), (840, 720), (810, 740), (790, 770), (770, 790), (745, 785), (715, 760), (670, 752), (620, 752), (580, 747), (545, 745), (530, 725), (527, 690), (522, 650), (510, 605), (497, 565), (510, 540), (540, 518), (580, 500), (615, 506), (645, 515), (668, 503), (685, 480)],
    'aurelion': [(292, 190), (315, 178), (345, 168), (372, 150), (395, 128), (418, 112), (445, 108), (472, 112), (500, 118), (530, 135), (560, 158), (590, 178), (615, 198), (632, 222), (640, 250), (636, 280), (635, 310), (642, 345), (652, 378), (665, 405), (680, 435), (688, 462), (675, 490), (650, 510), (615, 505), (580, 499), (545, 515), (515, 520), (490, 505), (465, 485), (445, 460), (430, 428), (410, 398), (380, 368), (350, 340), (320, 330), (292, 322), (290, 290), (288, 262), (290, 230), (292, 205)],
    'nacaris': [(30, 330), (110, 318), (190, 300), (240, 305), (262, 318), (282, 320), (320, 327), (350, 336), (380, 366), (410, 396), (432, 428), (452, 458), (480, 480), (510, 500), (518, 520), (500, 545), (470, 565), (440, 580), (400, 592), (360, 612), (320, 632), (280, 645), (230, 655), (150, 640), (60, 620), (25, 560), (20, 450)],
    'kharveth': [(950, 500), (990, 502), (1025, 507), (1060, 512), (1100, 517), (1140, 522), (1170, 532), (1200, 552), (1230, 572), (1260, 582), (1290, 575), (1312, 600), (1322, 630), (1318, 665), (1312, 690), (1322, 712), (1310, 738), (1200, 742), (1100, 742), (1000, 742), (955, 735), (955, 705), (965, 680), (970, 650), (960, 620), (950, 590), (955, 550)],
    'elyndor': [(675, 230), (700, 225), (730, 215), (760, 195), (790, 187), (815, 182), (840, 195), (860, 205), (880, 215), (895, 230), (910, 250), (925, 270), (930, 300), (935, 330), (945, 360), (950, 390), (950, 420), (940, 445), (905, 445), (880, 450), (855, 460), (830, 470), (795, 460), (755, 460), (730, 450), (700, 430), (675, 410), (655, 380), (645, 350), (635, 320), (635, 290), (640, 265), (650, 245)],
    'rhovaryn': [(895, 220), (930, 215), (970, 210), (1000, 210), (1030, 225), (1060, 240), (1090, 250), (1120, 255), (1150, 265), (1180, 280), (1210, 285), (1240, 282), (1270, 295), (1300, 315), (1320, 330), (1340, 350), (1360, 380), (1372, 405), (1385, 440), (1388, 480), (1375, 510), (1350, 530), (1320, 550), (1290, 565), (1260, 580), (1230, 570), (1200, 550), (1170, 530), (1140, 520), (1100, 515), (1060, 510), (1025, 505), (990, 500), (960, 490), (945, 470), (935, 430), (925, 390), (915, 350), (910, 310), (910, 270), (900, 240)],
}

# Ponto de ancoragem dos rótulos 3D: logo acima da tarja com o nome na carta
LABELS_PX = {
    'safra': (583, 572),
    'aurelion': (451, 236),
    'nacaris': (300, 413),
    'kharveth': (1086, 571),
    'elyndor': (785, 283),
    'rhovaryn': (1152, 331),
}

ORDER = ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn']


def to_arr(img: Image.Image) -> np.ndarray:
    return np.asarray(img, dtype=F) / 255


def to_img(arr: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')


def rgb_to_hsv(a: np.ndarray):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(axis=-1)
    mn = a.min(axis=-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rr = (mx == r) & m
    gg = (mx == g) & m & ~rr
    bb = m & ~rr & ~gg
    h[rr] = ((g - b)[rr] / d[rr]) % 6
    h[gg] = (b - r)[gg] / d[gg] + 2
    h[bb] = (r - g)[bb] / d[bb] + 4
    h = h * 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def poly_mask(points, size=(W, H), scale=1.0) -> np.ndarray:
    img = Image.new('L', size, 0)
    ImageDraw.Draw(img).polygon([(x * scale, y * scale) for x, y in points], fill=255)
    return np.asarray(img, dtype=F) / 255


def boxes_mask() -> np.ndarray:
    m = np.zeros((H, W), F)
    for x0, y0, x1, y1 in [*BOXES.values(), COMPASS]:
        m[y0:y1, x0:x1] = 1
    return m


# ── Terra, relevo e versões ───────────────────────────────────────────────


def land_mask(clean: np.ndarray, flat: np.ndarray) -> np.ndarray:
    small = blur(clean, 2.5)
    h, s, v = rgb_to_hsv(small)
    sea = (h > 172) & (h < 222) & (s > 0.36) & (v < 0.52)
    land = (~sea).astype(F)
    x0, y0, x1, y1 = NACARIS_LABEL
    land[y0:y1, x0:x1] = 1
    land = blur(land, 3)
    land = (land > 0.5).astype(F)
    land[FOG_BAND_Y:, :] = 0
    land = land * (flat < 0.5)
    return land


def distance_inside(mask: np.ndarray, steps: int = 40, factor: int = 4) -> np.ndarray:
    """Distância aproximada (em pixels da carta) de cada ponto da máscara até a borda, por erosões sucessivas."""
    small = np.asarray(Image.fromarray((mask * 255).astype(np.uint8), 'L').resize((W // factor, H // factor), Image.BOX), dtype=F) / 255 > 0.5
    dist = np.zeros(small.shape, F)
    cur = small.copy()
    for _ in range(steps):
        dist += cur
        nxt = cur.copy()
        nxt[1:, :] &= cur[:-1, :]
        nxt[:-1, :] &= cur[1:, :]
        nxt[:, 1:] &= cur[:, :-1]
        nxt[:, :-1] &= cur[:, 1:]
        cur = nxt
        if not cur.any():
            break
    big = Image.fromarray(dist.astype(np.float32), 'F').resize((W, H), Image.BILINEAR)
    return np.asarray(big, dtype=F) * factor


def bandpass(x: np.ndarray, small: float, big: float) -> np.ndarray:
    return blur(x, small) - blur(x, big)


def heightmap(clean: np.ndarray, land: np.ndarray, noise: Noise) -> np.ndarray:
    """
    Relevo lido do desenho da carta. As montanhas sobem só onde a carta pinta
    montanhas (zonas de MOUNTAINS): um maciço largo, mais alto onde há mais
    montanhas pintadas e que se ergue aos poucos da borda para o centro da zona
    (sem platôs nem paredões), e por cima os picos do próprio desenho — em
    rocha, as faces iluminadas e a neve; em Safra, a rocha escura entre os rios
    de lava, que ficam como vales. Campos e planícies ficam quase planos;
    florestas, levemente onduladas; as tarjas com nomes, lisas.
    """
    h, s, v = rgb_to_hsv(blur(clean, 0.7))
    lum = (clean * np.array([0.299, 0.587, 0.114], F)).sum(-1)
    green = ((h > 60) & (h < 170) & (s > 0.2)).astype(F)
    water = ((h > 175) & (h < 235) & (s > 0.28)).astype(F) * land
    lava = (((h < 50) | (h > 335)) & (s > 0.5) & (v > 0.5)).astype(F)

    # rios e lagos contam como fundo de vale
    water_soft = blur(water, 1)
    rock_lum = lum * (1 - water_soft) + 0.1 * water_soft
    peak_rock = blur(np.clip((bandpass(rock_lum, 2.0, 12.0) + 0.01) / 0.12, 0, 1), 1.5)
    lava_soft = blur(lava, 1.5)
    dark = (1 - lum) * (1 - lava_soft)
    peak_volcano = blur(np.clip((bandpass(dark, 2.0, 12.0) + 0.01) / 0.14, 0, 1), 1.5)
    trees = 1 - 0.6 * blur(green, 1.5)

    massif = np.zeros((H, W), F)
    peaks = np.zeros((H, W), F)
    for pts, kind, strength in MOUNTAINS:
        poly = poly_mask(REGIONS_PX[pts] if isinstance(pts, str) else pts)
        zone = blur(poly, 14)
        peak = (peak_volcano if kind == 'vulcao' else peak_rock) * trees
        # quantas montanhas a carta pinta em volta, e quão longe da borda da zona
        density = np.clip(blur(zone * peak, 22) / 0.3, 0, 1) ** 0.8
        dome = blur(smoothstep(0.0, 110.0, distance_inside(poly)) ** 0.7, 6)
        massif = np.maximum(massif, zone * strength * density * (0.15 + 0.85 * dome))
        detail = zone * strength * peak
        if kind == 'vulcao':
            detail = detail - zone * lava_soft * 0.35
        peaks = np.maximum(peaks, detail)

    # tarjas com nomes desenhados: sem picos nem ondulações, para os nomes ficarem legíveis
    k = W / 1152  # as tarjas foram medidas na prévia de 1152 px
    plates = np.zeros((H, W), F)
    for x0, y0, x1, y1 in NAME_PLATES:
        plates[int(y0 * k) - 6 : int(y1 * k) + 6, int(x0 * k) - 6 : int(x1 * k) + 6] = 1
    plates = blur(plates, 6)

    ys, xs = np.mgrid[0:H, 0:W].astype(F)
    plains = noise.fbm(xs / 45, ys / 45, 4)
    forest = blur(green * land, 1.5) * np.clip(bandpass(lum, 0.8, 4.0) / 0.1 + 0.5, 0, 1)
    # praias baixas, cartelas planas e o relevo some sob as nuvens do pé da carta
    shore = smoothstep(1.0, 22.0, distance_inside(land))
    away_from_boxes = smoothstep(4.0, 60.0, distance_inside(1 - boxes_mask()))
    fade = 1 - smoothstep(FOG_BAND_Y - 120, FOG_BAND_Y, np.arange(H, dtype=F)[:, None])
    relief = (MASSIF_HEIGHT * massif + PEAK_HEIGHT * peaks * (1 - plates)) * shore * away_from_boxes * fade
    elev = land * (0.025 + 0.008 * plains + 0.012 * forest * (1 - plates) + relief)
    return blur(elev, 0.9).astype(F)


def known_heightmap(elev: np.ndarray, area: np.ndarray, noise: Noise) -> np.ndarray:
    """
    Relevo do mundo conhecido: o território apagado de Safra vira terra plana,
    sem registro. O aplainamento vai um pouco além do papel em branco, para que
    a borda pontilhada também fique plana (sem um rebordo de montanhas em volta).
    """
    ys, xs = np.mgrid[0:H, 0:W].astype(F)
    blank = 0.025 + 0.006 * noise.fbm(xs / 60 + 7.3, ys / 60 + 2.1, 3)
    cover = blur((blur(area, 6) > 0.01).astype(F), 6)
    return (elev * (1 - cover) + np.minimum(elev, blank) * cover).astype(F)


def safra_area(clean: np.ndarray, land: np.ndarray) -> np.ndarray:
    """Território de Safra seguindo o desenho: tons de lava e rocha avermelhada perto do polígono."""
    poly = poly_mask(REGIONS_PX['safra'])
    near = blur(poly, 22) > 0.08
    core = blur(poly, 22) > 0.92
    h, sat, v = rgb_to_hsv(blur(clean, 2))
    reddish = ((h < 32) | (h > 345)) & ((v < 0.36) | (sat > 0.55))
    area = ((reddish & near) | core).astype(F) * land
    area = blur(area, 6)
    area = (area > 0.5).astype(F)
    return blur(area, 2.5)


def known_version(clean: np.ndarray, land: np.ndarray, noise: Noise) -> np.ndarray:
    """Versão oficial: o território de Safra em branco, como no encarte "O mundo atual" da carta."""
    area = safra_area(clean, land)
    ys, xs = np.mgrid[0:H, 0:W].astype(F)
    fiber = noise.fbm(xs / 14, ys / 14, 3)[..., None] * 0.025 + noise.fbm(xs / 90, ys / 90, 3)[..., None] * 0.04
    paper = np.array([0.84, 0.79, 0.69], F) + fiber
    out = clean * (1 - area[..., None]) + paper * area[..., None]
    # contorno pontilhado da região apagada
    edge = smoothstep(0.2, 0.45, area) * smoothstep(0.8, 0.55, area)
    dots = (np.sin(xs * 0.55) * np.sin(ys * 0.55) > 0.15).astype(F)
    edge = blur(edge * dots, 0.8)
    ink = np.array([0.3, 0.22, 0.16], F)
    out = out * (1 - edge[..., None] * 0.85) + ink * edge[..., None] * 0.85
    return np.clip(out, 0, 1).astype(F)


# ── Detalhes dos reinos ───────────────────────────────────────────────────


def detail_box(points, margin=0.16, aspect=1.5, min_w=600, step=4):
    """
    Janela 3:2 que contém a região com folga. Entre as posições possíveis,
    escolhe a que menos invade as cartelas (título, legenda, encartes…) e,
    no empate, a mais centrada na região.
    """
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w = max((x1 - x0) * (1 + 2 * margin), (y1 - y0) * (1 + 2 * margin) * aspect, min_w)
    w = min(w, W)
    h = min(w / aspect, H)
    w = h * aspect
    boxes = boxes_mask()
    integral = boxes.cumsum(0).cumsum(1)

    def overlap(ax, ay):
        bx, by = int(ax + w) - 1, int(ay + h) - 1
        ax, ay = int(ax), int(ay)
        total = integral[by, bx]
        if ax > 0:
            total -= integral[by, ax - 1]
        if ay > 0:
            total -= integral[ay - 1, bx]
        if ax > 0 and ay > 0:
            total += integral[ay - 1, ax - 1]
        return float(total)

    pad = 10  # a região inteira, com uma pequena folga, precisa caber
    best = None
    for ax in np.arange(max(0, x1 + pad - w), min(x0 - pad, W - w) + 1, step):
        for ay in np.arange(max(0, y1 + pad - h), min(y0 - pad, H - h) + 1, step):
            score = (overlap(ax, ay), abs(ax + w / 2 - cx) + abs(ay + h / 2 - cy))
            if best is None or score < best[0]:
                best = (score, ax, ay)
    if best is None:  # região maior que a janela: centraliza
        ax = min(max(cx - w / 2, 0), W - w)
        ay = min(max(cy - h / 2, 0), H - h)
    else:
        _, ax, ay = best
    return int(round(ax)), int(round(ay)), int(round(ax + w)), int(round(ay + h))


def export_details(clean: np.ndarray, out_dir: Path, scale: int = 2):
    """Detalhe de cada reino na carta original: a região em destaque, o restante esmaecido."""
    out_dir.mkdir(parents=True, exist_ok=True)
    gray = clean.mean(axis=-1, keepdims=True)
    dim = (clean * 0.35 + gray * 0.65) * 0.36
    boxes = {}
    for key in ORDER:
        pts = REGIONS_PX[key]
        m = blur(poly_mask(pts), 7)[..., None]
        out = clean * m + dim * (1 - m)
        box = detail_box(pts)
        img = to_img(out).crop(box)
        img = img.resize((img.width * scale, img.height * scale), Image.LANCZOS)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
        img.save(out_dir / f'{key}.webp', 'WEBP', quality=86, method=6)
        boxes[key] = (box, img.size)
    return boxes


# ── Exportação ────────────────────────────────────────────────────────────


# Escala do relevo exportado: uma unidade de altura da carta ocupa a faixa
# inteira do PNG de 16 bits (o 3D multiplica pela sua própria escala vertical).
RELIEF_RANGE = (-0.06, 0.94)


def export_heightmap(elev: np.ndarray, path: Path, size=(600, 400)):
    lo, hi = RELIEF_RANGE
    norm = np.clip((elev - lo) / (hi - lo), 0, 1)
    small = np.asarray(Image.fromarray(norm.astype(np.float32), 'F').resize(size, Image.BOX), dtype=np.float64)
    v = np.clip(np.round(small * 65535), 0, 65535).astype(np.uint32)
    rgb = np.zeros(small.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = (v >> 8).astype(np.uint8)
    rgb[..., 1] = (v & 255).astype(np.uint8)
    Image.fromarray(rgb, 'RGB').save(path, optimize=True)
    return lo, hi


def main():
    preview = '--previa' in sys.argv
    noise = Noise(2026)
    src = to_arr(Image.open(SRC).convert('RGB'))
    assert src.shape[:2] == (H, W), f'esperado {W}×{H}, recebido {src.shape[1]}×{src.shape[0]}'

    clean = src
    flat = blur(boxes_mask(), 3)

    print('Terra e relevo…')
    land = land_mask(clean, flat)
    elev = heightmap(clean, land, noise)

    print('Versões da carta…')
    known = known_version(clean, land, noise)
    OUT.mkdir(parents=True, exist_ok=True)
    to_img(clean).save(OUT / 'mapa-mundo-original.webp', 'WEBP', quality=90, method=6)
    to_img(known).save(OUT / 'mapa-mundo-conhecido.webp', 'WEBP', quality=90, method=6)
    Image.fromarray((land * 255).astype(np.uint8), 'L').resize((1200, 800), Image.BOX).save(OUT / 'mascara-terra.png', optimize=True)
    lo, hi = export_heightmap(elev, OUT / 'relevo-mundo.png')
    export_heightmap(known_heightmap(elev, safra_area(clean, land), noise), OUT / 'relevo-mundo-conhecido.png')

    print('Detalhes dos reinos…')
    for key, (box, size) in export_details(clean, OUT / 'carta').items():
        print(f'  {key}: recorte {box} → {size[0]}×{size[1]}')

    data = {
        'estado': 'conceitual',
        'nota': 'Mapa ilustrado do manuscrito (Edição Profissional Ilustrada). Nomes, capitais e fronteiras são conceituais e sujeitos a revisão; o relevo 3D é uma interpretação da carta.',
        'cartaIlustrada': True,
        'largura': W,
        'altura': H,
        'relevo': {
            'arquivo': '/images/atlas/relevo-mundo.png',
            'arquivoConhecido': '/images/atlas/relevo-mundo-conhecido.png',
            'codificacao': 'rg16',
            'largura': 600,
            'altura': 400,
            'nivelDoMar': round((0.0 - lo) / (hi - lo), 5),
        },
        'mascaraTerra': '/images/atlas/mascara-terra.png',
        'regioes': [
            {
                'id': key,
                'reino': key,
                'estado': 'conceitual',
                'rotulo': [round(LABELS_PX[key][0] / W, 4), round(LABELS_PX[key][1] / H, 4)],
                'poligono': [[round(x / W, 4), round(y / H, 4)] for x, y in REGIONS_PX[key]],
            }
            for key in ORDER
        ],
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

    if preview:
        PREVIEW.mkdir(exist_ok=True)
        over = clean.copy()
        colors = {'safra': (0.9, 0.1, 0.1), 'aurelion': (1, 0.85, 0), 'nacaris': (0, 0.4, 1), 'kharveth': (0.6, 0.6, 0.6), 'elyndor': (1, 1, 1), 'rhovaryn': (0, 0.9, 0.2)}
        for key, pts in REGIONS_PX.items():
            m = poly_mask(pts) * land
            over = over * (1 - m[..., None] * 0.45) + np.array(colors[key], F) * m[..., None] * 0.45
        to_img(over).save(PREVIEW / 'regioes.png')
        Image.fromarray((land * 255).astype(np.uint8), 'L').save(PREVIEW / 'terra.png')
        e = (elev - elev.min()) / (elev.max() - elev.min())
        Image.fromarray((e * 255).astype(np.uint8), 'L').save(PREVIEW / 'relevo.png')
    print('Pronto.')


if __name__ == '__main__':
    main()
