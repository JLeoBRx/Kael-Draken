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

# Zonas montanhosas lidas na carta: (polígono em pixels, intensidade)
MOUNTAINS = [
    # cordilheira do norte (Terras do Norte e Montanhas Eternas)
    ([(380, 60), (560, 30), (760, 30), (980, 40), (1150, 110), (1230, 170), (1250, 230), (1180, 250), (1060, 210), (930, 190), (800, 170), (700, 170), (600, 140), (520, 120), (420, 110)], 1.0),
    # Além das Montanhas
    ([(1260, 200), (1360, 220), (1450, 290), (1490, 380), (1470, 480), (1420, 560), (1370, 560), (1385, 470), (1370, 390), (1320, 320), (1260, 270)], 0.7),
    # Kharveth
    ([(950, 500), (1170, 520), (1320, 590), (1325, 735), (955, 740), (950, 600)], 0.85),
    # Safra
    ([(500, 520), (700, 455), (860, 470), (920, 560), (900, 680), (800, 760), (700, 790), (560, 760), (520, 650)], 0.8),
    # ilhas montanhosas do sul
    ([(200, 790), (330, 790), (480, 830), (500, 900), (200, 900)], 0.55),
    ([(640, 840), (760, 830), (900, 800), (945, 830), (945, 900), (640, 900)], 0.5),
    # colinas de Elyndor e do norte de Aurelion
    ([(660, 200), (900, 190), (950, 330), (900, 440), (700, 440), (640, 320)], 0.25),
    ([(380, 100), (560, 110), (600, 180), (450, 200), (360, 170)], 0.35),
]

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


def heightmap(clean: np.ndarray, land: np.ndarray, noise: Noise) -> np.ndarray:
    """
    Relevo interpretado da carta: zonas montanhosas lidas no desenho, moduladas
    pela textura local (onde há picos desenhados, há contraste), mais um
    planalto suave no interior e pequenas ondulações.
    """
    lum = clean.mean(axis=-1)
    mean = blur(lum, 3)
    var = np.clip(blur(lum * lum, 3) - mean * mean, 0, None)
    rough = np.clip(np.sqrt(var) / 0.14, 0, 1)
    plates = np.zeros((H, W), F)
    k = W / 1152  # as tarjas foram medidas na prévia de 1152 px
    for x0, y0, x1, y1 in NAME_PLATES:
        plates[int(y0 * k) - 6 : int(y1 * k) + 6, int(x0 * k) - 6 : int(x1 * k) + 6] = 1
    hard = plates.copy()
    plates = blur(plates, 6)
    # dentro das tarjas, a rugosidade vem dos arredores (sem degraus no relevo)
    keep = 1 - hard
    fill = blur(rough * keep, 28) / np.maximum(blur(keep, 28), 1e-3)
    rough = rough * (1 - plates) + fill * plates
    zones = np.zeros((H, W), F)
    for pts, strength in MOUNTAINS:
        zones = np.maximum(zones, poly_mask(pts) * strength)
    zones = blur(zones, 24)
    ridges = blur(rough, 2.5) ** 1.3
    ys, xs = np.mgrid[0:H, 0:W].astype(F)
    peaks = noise.ridged(xs / 60, ys / 60, 5)
    mountain = zones * (0.45 + 0.55 * ridges) * (0.7 + 0.3 * peaks)
    inland = blur(land, 26)
    inland = np.clip((inland - 0.5) * 2.4, 0, 1) ** 0.9
    # as montanhas descem até a costa e até as cartelas, sem paredões
    shore = smoothstep(4.0, 95.0, distance_inside(land))
    away_from_boxes = smoothstep(4.0, 110.0, distance_inside(1 - boxes_mask()))
    # as nuvens do pé da carta escondem o relevo aos poucos
    ys0 = np.arange(H, dtype=F)[:, None]
    fade = 1 - smoothstep(FOG_BAND_Y - 130, FOG_BAND_Y, ys0)
    mountain = mountain * shore * away_from_boxes * fade
    detail = noise.fbm(xs / 30, ys / 30, 4)
    elev = land * (0.035 + (inland * 0.09 + detail * 0.018) * fade + mountain * 0.75)
    coast = blur(land, 12)
    depth = -0.05 * (1 - np.clip(coast * 3, 0, 1))
    elev = np.where(land > 0.5, np.maximum(elev, 0.025), depth)
    elev = blur(elev, 2.6)
    # superfície lisa sob as tarjas, para os nomes ficarem legíveis no 3D
    elev = elev * (1 - plates) + blur(elev, 10) * plates
    return elev.astype(F)


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


def export_heightmap(elev: np.ndarray, path: Path, size=(600, 400)):
    lo, hi = float(elev.min()), float(elev.max())
    norm = (elev - lo) / (hi - lo)
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
