"""
Gerador do mundo conceitual do Atlas.

Produz, a partir do mesmo relevo procedural:
  - public/images/atlas/mapa-mundo-original.webp   (seis reinos)
  - public/images/atlas/mapa-mundo-conhecido.webp  (versão oficial: Safra apagada)
  - public/images/atlas/relevo-mundo.png           (altura 16 bits em R+G, usada pelo 3D)
  - public/images/atlas/mascara-terra.png          (terra = branco, água = preto)
  - src/data/atlas/world.json                      (regiões conceituais, editáveis)

IMPORTANTE: toda a geografia aqui é uma COMPOSIÇÃO CONCEITUAL. Posições,
fronteiras, costas e rios não foram aprovados pelo autor. As regiões dos
reinos ficam em src/data/atlas/world.json e podem ser editadas à mão; depois,
rode `npm run art:mapas` para refazer as cartas.

Uso:
  python3 scripts/art/world.py               # usa as regiões já salvas
  python3 scripts/art/world.py --regenerar   # recalcula as regiões a partir dos centros
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from artlib import (  # noqa: E402
    F,
    Mask,
    Noise,
    blur,
    grain,
    grid,
    hex2rgb,
    mix,
    multiply,
    ramp,
    save_webp,
    smoothstep,
    vignette,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'images' / 'atlas'
DATA = ROOT / 'src' / 'data' / 'atlas' / 'world.json'

W, H = 2400, 1500
ASPECT = W / H  # 1.6

# ── Diretrizes do relevo (coordenadas isotrópicas: x ∈ [0, 1.6], y ∈ [0, 1]) ──

LAND_BLOBS = [
    # continente central
    (0.86, 0.50, 0.28), (0.66, 0.42, 0.20), (0.98, 0.40, 0.18), (0.78, 0.25, 0.17), (0.98, 0.23, 0.14),
    (0.62, 0.27, 0.11), (0.70, 0.70, 0.18), (0.90, 0.72, 0.15), (0.62, 0.84, 0.10),
    # costa oeste (proposta para Nácaris)
    (0.42, 0.46, 0.15), (0.30, 0.50, 0.12), (0.26, 0.64, 0.08), (0.38, 0.35, 0.08),
    # istmo e península leste (proposta para Safra)
    (1.12, 0.47, 0.06), (1.18, 0.45, 0.05), (1.30, 0.42, 0.13), (1.40, 0.50, 0.10), (1.36, 0.32, 0.07), (1.46, 0.42, 0.06),
    # ilhas
    (0.14, 0.42, 0.035), (0.15, 0.60, 0.045), (0.20, 0.76, 0.035), (0.10, 0.70, 0.022), (1.24, 0.79, 0.045),
    (1.33, 0.70, 0.03), (0.52, 0.93, 0.028), (1.52, 0.24, 0.028), (0.46, 0.15, 0.03),
]
SEA_CUTS = [(0.52, 0.59, 0.07), (1.08, 0.63, 0.075), (1.16, 0.33, 0.05), (0.80, 0.95, 0.08), (0.49, 0.25, 0.05), (0.35, 0.78, 0.06)]
RIDGE = [(0.56, 0.27), (0.66, 0.20), (0.80, 0.17), (0.96, 0.17), (1.05, 0.22), (1.10, 0.30)]
SPUR = [(0.96, 0.17), (0.93, 0.29), (0.99, 0.37)]
VOLCANOES = [(1.30, 0.37, 0.07, 0.55), (1.40, 0.49, 0.055, 0.45), (1.27, 0.49, 0.045, 0.35)]
LAKES = [(0.73, 0.36, 0.028), (0.86, 0.32, 0.02), (0.97, 0.58, 0.017)]
RIVER_SOURCES = [
    (0.62, 0.26), (0.72, 0.23), (0.86, 0.22), (1.00, 0.24), (1.06, 0.31), (0.68, 0.32), (0.80, 0.40),
    (1.31, 0.45), (1.36, 0.40), (1.40, 0.53), (0.44, 0.41), (0.33, 0.52), (0.95, 0.47), (0.64, 0.62),
    (0.88, 0.66), (0.77, 0.29), (0.56, 0.36), (0.74, 0.58),
]

KINGDOM_CENTERS = {
    'nacaris': (0.33, 0.50),
    'kharveth': (0.80, 0.19),
    'elyndor': (0.76, 0.385),
    'aurelion': (0.94, 0.54),
    'rhovaryn': (0.72, 0.77),
    'safra': (1.34, 0.43),
}
ORDER = ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn']


def dist_polyline(X, Y, pts):
    d = np.full(X.shape, 1e9, dtype=F)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((X - x0) * dx + (Y - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.minimum(d, np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy)))
    return d


# ── Terreno ────────────────────────────────────────────────────────────────


def build_terrain():
    X, Y = grid(H, W)
    n_warp_a, n_warp_b, n_coast, n_hills, n_ridge, n_moist = (Noise(s) for s in (11, 12, 13, 14, 15, 16))

    XW = X + n_warp_a.fbm(X * 2.4, Y * 2.4, 5) * 0.075
    YW = Y + n_warp_b.fbm(X * 2.4 + 7, Y * 2.4, 5) * 0.075

    mass = np.zeros_like(X)
    for cx, cy, r in LAND_BLOBS:
        mass += np.exp(-((XW - cx) ** 2 + (YW - cy) ** 2) / (r * r))
    for cx, cy, r in SEA_CUTS:
        mass -= 0.9 * np.exp(-((XW - cx) ** 2 + (YW - cy) ** 2) / (r * r))
    union = np.minimum(mass, 1.25)
    XD = XW + n_warp_a.fbm(X * 11 + 5, Y * 11, 4) * 0.018
    YD = YW + n_warp_b.fbm(X * 11, Y * 11 + 5, 4) * 0.018
    field = union + 0.30 * n_coast.fbm(XD * 3.4, YD * 3.4, 7) + 0.16 * n_coast.fbm(XD * 13 + 3, YD * 13, 5)
    # margem de oceano nas bordas
    edge = np.minimum.reduce([X / ASPECT, 1 - X / ASPECT, Y, 1 - Y])
    field *= smoothstep(0.0, 0.08, edge)
    land = field > 0.52

    dist_in = blur(land.astype(F), 80)
    inland = smoothstep(0.45, 1.0, dist_in)
    broad = n_hills.fbm(X * 2.3, Y * 2.3, 4) * 0.5 + 0.5
    hills = n_hills.fbm(X * 7 + 4, Y * 7, 7) * 0.5 + 0.5
    elev = 0.025 + inland * (0.08 + 0.13 * broad) + 0.07 * hills * inland

    # Cordilheira (proposta para Kharveth)
    ridge_mask = np.exp(-((dist_polyline(XW, YW, RIDGE) / 0.085) ** 2))
    spur_mask = np.exp(-((dist_polyline(XW, YW, SPUR) / 0.05) ** 2)) * 0.7
    rid = n_ridge.ridged(X * 8, Y * 8, 8)
    elev += np.maximum(ridge_mask, spur_mask) * (0.3 + 0.7 * rid ** 1.3) * 1.05 * smoothstep(0.5, 0.7, dist_in)

    # Planalto vulcânico (proposta para Safra)
    plateau = np.exp(-(((XW - 1.34) ** 2) / 0.016 + ((YW - 0.44) ** 2) / 0.014))
    elev += 0.12 * plateau * inland
    for cx, cy, r, hgt in VOLCANOES:
        d = np.hypot(XW - cx, YW - cy) / r
        elev += np.clip(1 - d, 0, 1) ** 1.7 * hgt - np.exp(-((d / 0.17) ** 2)) * hgt * 0.42

    # Colinas e vales: Elyndor (colinas e lagos), Aurelion (vale), Rhovaryn (planícies)
    elev += 0.08 * np.exp(-(((XW - 0.76) ** 2) + (YW - 0.35) ** 2) / 0.012) * hills
    elev -= 0.05 * np.exp(-(((XW - 0.92) ** 2) / 0.03 + ((YW - 0.56) ** 2) / 0.01)) * inland
    plains = np.exp(-(((XW - 0.72) ** 2) / 0.06 + ((YW - 0.80) ** 2) / 0.02))
    elev = elev * (1 - 0.45 * plains) + 0.04 * plains * inland

    elev = np.where(land, elev, 0.0).astype(F)
    t_ridge = np.maximum(ridge_mask, spur_mask)

    # Lagos
    lake = np.zeros_like(X)
    LX = X + n_warp_a.fbm(X * 9, Y * 9, 4) * 0.02
    LY = Y + n_warp_b.fbm(X * 9 + 2, Y * 9, 4) * 0.02
    for cx, cy, r in LAKES:
        lake = np.maximum(lake, np.exp(-((LX - cx) ** 2 + (LY - cy) ** 2) / (r * r)))
    lake = (lake + 0.1 * n_coast.fbm(X * 14, Y * 14, 4)) > 0.55
    lake &= land
    lake_level = blur(elev, 30)
    elev = np.where(lake, np.minimum(elev, lake_level - 0.03), elev).astype(F)

    # Oceano: profundidade crescente a partir da costa
    near = blur(land.astype(F), 40)
    sea_depth = np.where(land, 0, -(0.02 + 0.10 * (1 - np.clip(near * 2.2, 0, 1)))).astype(F)
    elev = np.where(land, elev, sea_depth).astype(F)

    moist = n_moist.fbm(X * 5, Y * 5, 6) * 0.5 + 0.5
    return {'X': X, 'Y': Y, 'land': land, 'lake': lake, 'elev': elev, 'field': field, 'moist': moist, 'hills': hills, 'ridge': t_ridge, 'dist_in': dist_in}


def trace_rivers(t):
    """Rios por descida de gradiente sobre um potencial (altura + distância ao mar)."""
    scale = 4
    h, w = H // scale, W // scale
    elev = t['elev'][::scale, ::scale]
    land = t['land'][::scale, ::scale] & ~t['lake'][::scale, ::scale]
    to_sea = blur(t['land'][::scale, ::scale].astype(F), 30)
    pot = 0.5 * blur(elev, 3) + to_sea
    gy, gx = np.gradient(pot)
    meander = Noise(21)
    rivers: list[list[tuple[float, float]]] = []
    occupied = np.zeros((h, w), dtype=bool)
    for sx, sy in RIVER_SOURCES:
        x, y = sx / ASPECT * w, sy * h
        path = [(x, y)]
        vx, vy = 0.0, 0.0
        reached = False
        for step in range(1400):
            ix, iy = int(x), int(y)
            if not (0 <= ix < w and 0 <= iy < h):
                break
            if not land[iy, ix] and step > 3 and not t['lake'][iy * scale, ix * scale]:
                reached = True
                break
            if step > 12 and occupied[max(iy - 1, 0) : iy + 2, max(ix - 1, 0) : ix + 2].any():
                path.append((x, y))
                reached = True
                break
            dx, dy = -gx[iy, ix], -gy[iy, ix]
            norm = math.hypot(dx, dy) + 1e-9
            dx, dy = dx / norm, dy / norm
            a = float(meander(x * 0.06, y * 0.06)) * 1.1
            dx, dy = dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)
            vx, vy = 0.65 * vx + 0.35 * dx, 0.65 * vy + 0.35 * dy
            n2 = math.hypot(vx, vy) + 1e-9
            x, y = x + vx / n2 * 0.9, y + vy / n2 * 0.9
            path.append((x, y))
        if reached and len(path) > 60:
            for px, py in path[:-6]:
                occupied[int(py) % h, int(px) % w] = True
            rivers.append([(px * scale, py * scale) for px, py in path])
    return rivers


def carve_rivers(t, rivers):
    m = Mask(H, W, ss=1)
    for r in rivers:
        m.line(r, 6)
    carve = blur(m.array(), 5)
    t['elev'] = np.where(t['land'], t['elev'] - 0.025 * carve, t['elev']).astype(F)


# ── Regiões conceituais ────────────────────────────────────────────────────


def clip_halfplane(poly, a, b, c):
    """Mantém a parte do polígono onde a*x + b*y <= c."""
    out = []
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        fp, fq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if fp <= 0:
            out.append(p)
        if (fp < 0 < fq) or (fq < 0 < fp):
            s = fp / (fp - fq)
            out.append((p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])))
    return out


def build_regions():
    noise_x, noise_y = Noise(31), Noise(32)
    box = [(-0.08, -0.08), (ASPECT + 0.08, -0.08), (ASPECT + 0.08, 1.08), (-0.08, 1.08)]
    regions = {}
    for key, (cx, cy) in KINGDOM_CENTERS.items():
        poly = list(box)
        for other, (ox, oy) in KINGDOM_CENTERS.items():
            if other == key:
                continue
            a, b = ox - cx, oy - cy
            c = (ox * ox + oy * oy - cx * cx - cy * cy) / 2
            poly = clip_halfplane(poly, a, b, c)
        poly = [(round(x, 6), round(y, 6)) for x, y in poly]
        dense = []
        for i in range(len(poly)):
            p, q = poly[i], poly[(i + 1) % len(poly)]
            lo, hi = (p, q) if p <= q else (q, p)
            n = max(1, math.ceil(math.dist(lo, hi) / 0.012))
            seg = [(lo[0] + (hi[0] - lo[0]) * k / n, lo[1] + (hi[1] - lo[1]) * k / n) for k in range(n)]
            if p > q:
                seg = [(hi[0] + (lo[0] - hi[0]) * k / n, hi[1] + (lo[1] - hi[1]) * k / n) for k in range(n)]
            dense.extend(seg)
        displaced = []
        for x, y in dense:
            dx = float(noise_x(x * 6, y * 6)) * 0.035
            dy = float(noise_y(x * 6, y * 6)) * 0.035
            displaced.append((round((x + dx) / ASPECT, 4), round(y + dy, 4)))
        regions[key] = displaced
    return regions


def region_mask(polygon, w=W, h=H):
    m = Mask(h, w, ss=1)
    m.poly([(x * w, y * h) for x, y in polygon])
    return m.array() > 0.5


def label_point(polygon, land):
    m = region_mask(polygon, W // 4, H // 4) & land[::4, ::4]
    ys, xs = np.nonzero(m)
    if not len(xs):
        return [0.5, 0.5]
    # ponto da região mais próximo do centróide (garante que fique sobre a terra)
    cx, cy = xs.mean(), ys.mean()
    i = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)
    return [round(float(xs[i]) / (W // 4), 4), round(float(ys[i]) / (H // 4), 4)]


# ── Renderização das cartas ────────────────────────────────────────────────


def hillshade(elev, z=900.0):
    gy, gx = np.gradient(blur(elev, 1.2) * z)
    nx, ny, nz = -gx, -gy, np.ones_like(gx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    lx, ly, lz = -0.62, -0.62, 0.48
    ln = math.sqrt(lx * lx + ly * ly + lz * lz)
    return ((nx * lx + ny * ly + nz * lz) / (norm * ln)).astype(F)


def parchment(X, Y, base='#e8dbbd', stain='#c9b083', seed=41):
    n = Noise(seed)
    img = np.broadcast_to(hex2rgb(base), X.shape + (3,)).astype(F).copy()
    stains = smoothstep(0.1, 0.6, n.fbm(X * 2.5, Y * 2.5, 6) * 0.5 + 0.5)
    img = mix(img, hex2rgb(stain), stains * 0.35)
    fibers = Noise(seed + 1).fbm(X * 90, Y * 18, 3)
    img = multiply(img, 1 + fibers * 0.025)
    speck = Noise(seed + 2).fbm(X * 200, Y * 200, 2)
    return multiply(img, 1 - np.clip(speck - 0.55, 0, 1) * 0.6)


def glyph_layer(t, palette, seed=7):
    """Ícones desenhados à mão: montanhas, colinas, vulcões e árvores (tinta sobre pergaminho)."""
    from PIL import ImageDraw

    ss = 3
    layer = Image.new('RGBA', (W * ss, H * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rng = np.random.default_rng(seed)
    elev, land, lake, ridge, hills = t['elev'], t['land'], t['lake'], t['ridge'], t['hills']
    ink = palette['ink']
    lw = 2 * ss // 2 + 1

    def P(x, y):
        return (x * ss, y * ss)

    items = []
    step = 34
    volcano_px = [((cx / ASPECT) * W, cy * H, r) for cx, cy, r, _ in VOLCANOES]
    for gy in range(step, H - step, step):
        for gx in range(step, W - step, step):
            x = gx + rng.uniform(-0.45, 0.45) * step
            y = gy + rng.uniform(-0.45, 0.45) * step
            ix, iy = int(x), int(y)
            if not land[iy, ix] or lake[iy, ix]:
                continue
            near_volcano = any(math.hypot(x - vx, y - vy) < r * H * 0.9 for vx, vy, r in volcano_px)
            e = float(elev[iy, ix])
            if ridge[iy, ix] > 0.42 and e > 0.34 and not near_volcano and rng.random() < 0.8:
                items.append((y, 'mountain', x, 12 + 46 * min(1.0, (e - 0.34) / 0.55) * rng.uniform(0.75, 1.1)))
            elif ridge[iy, ix] > 0.25 and e > 0.26 and not near_volcano and rng.random() < 0.35:
                items.append((y, 'mountain', x, 9 + 10 * rng.random()))
            elif near_volcano and e > 0.24 and rng.random() < 0.4:
                items.append((y, 'mountain', x, 9 + 14 * min(1.0, (e - 0.2) / 0.4)))
            elif hills[iy, ix] > 0.63 and 0.15 < e < 0.4 and rng.random() < 0.3:
                items.append((y, 'hill', x, 7 + 5 * rng.random()))
    for vx, vy, r in volcano_px:
        items.append((vy + 18, 'volcano', vx, r * H * 0.75))

    forest = (t['moist'] > 0.57) & land & ~lake & (elev > 0.04) & (elev < 0.32) & (ridge < 0.3)
    tstep = 11
    for gy in range(tstep, H - tstep, tstep):
        for gx in range(tstep, W - tstep, tstep):
            x = gx + rng.uniform(-0.5, 0.5) * tstep
            y = gy + rng.uniform(-0.5, 0.5) * tstep
            if forest[int(y), int(x)] and rng.random() < 0.7:
                items.append((y, 'tree', x, 5 + 2.5 * rng.random()))

    items.sort(key=lambda it: it[0])
    for y, kind, x, size in items:
        if kind == 'mountain':
            w = size * rng.uniform(0.85, 1.05)
            peak = (x + rng.uniform(-0.12, 0.12) * w, y - size)
            left, right = (x - w, y), (x + w * rng.uniform(0.85, 1.05), y)
            foot = (peak[0] + (right[0] - peak[0]) * 0.18, y)
            d.polygon([P(*left), P(*peak), P(*right)], fill=palette['light'])
            d.polygon([P(*peak), P(*right), P(*foot)], fill=palette['shade'])
            for k in range(1, int(size / 6) + 1):
                f = k / (int(size / 6) + 1)
                a = (peak[0] + (right[0] - peak[0]) * f, peak[1] + (right[1] - peak[1]) * f)
                b = (a[0] - size * 0.22, a[1] + size * 0.32)
                d.line([P(*a), P(*b)], fill=palette['hatch'], width=ss)
            if size > 34:
                cap = [(peak[0] - w * 0.18, peak[1] + size * 0.24), peak, (peak[0] + w * 0.08, peak[1] + size * 0.2), (peak[0] - w * 0.03, peak[1] + size * 0.3)]
                d.polygon([P(*q) for q in cap], fill=palette['snow'])
            d.line([P(*left), P(*peak), P(*right)], fill=ink, width=lw)
        elif kind == 'hill':
            w = size * 1.7
            box = [P(x - w, y - size), P(x + w, y + size)]
            d.arc(box, 195, 345, fill=ink, width=lw)
            d.arc([P(x - w * 0.55, y - size * 0.45), P(x + w * 1.25, y + size * 1.1)], 200, 300, fill=palette['hatch'], width=ss)
        elif kind == 'volcano':
            w = size
            top = size * 0.9
            pts = [(x - w, y), (x - w * 0.22, y - top), (x + w * 0.22, y - top), (x + w, y)]
            d.polygon([P(*q) for q in pts], fill=palette['shade'])
            d.polygon([P(*pts[1]), P(x - w * 0.05, y - top), P(x - w * 0.45, y), P(*pts[0])], fill=palette['light'])
            d.line([P(*q) for q in pts], fill=ink, width=lw)
            d.ellipse([P(x - w * 0.22, y - top - size * 0.06), P(x + w * 0.22, y - top + size * 0.06)], fill=palette['crater'], outline=ink, width=lw)
            if palette.get('ember'):
                d.ellipse([P(x - w * 0.12, y - top - size * 0.035), P(x + w * 0.12, y - top + size * 0.035)], fill=palette['ember'])
                for k in range(5):
                    sx = x + rng.uniform(-0.1, 0.25) * w + k * size * 0.12
                    sy = y - top - size * (0.25 + k * 0.22)
                    rr = size * (0.12 + k * 0.05)
                    d.ellipse([P(sx - rr, sy - rr * 0.7), P(sx + rr, sy + rr * 0.7)], outline=palette['smoke'], width=ss)
        else:
            if rng.random() < 0.6:
                d.polygon([P(x, y - size * 1.9), P(x + size * 0.75, y), P(x - size * 0.75, y)], fill=palette['tree'], outline=ink)
            else:
                d.ellipse([P(x - size * 0.8, y - size * 1.8), P(x + size * 0.8, y - size * 0.3)], fill=palette['tree'], outline=ink)
            d.line([P(x, y), P(x, y + size * 0.5)], fill=ink, width=ss)

    small = layer.resize((W, H), Image.LANCZOS)
    arr = np.asarray(small, dtype=F) / 255
    return arr[..., :3], arr[..., 3]


def draw_frame(img, ink):
    h, w = img.shape[:2]
    m = Mask(h, w, ss=2)
    for inset, width in ((22, 3), (34, 1.2)):
        m.line([(inset, inset), (w - inset, inset), (w - inset, h - inset), (inset, h - inset), (inset, inset)], width)
    for i in range(60):
        x = 34 + i * (w - 68) / 59
        m.line([(x, 22), (x, 28 if i % 2 else 34)], 1)
        m.line([(x, h - 22), (x, h - (28 if i % 2 else 34))], 1)
    for i in range(38):
        y = 34 + i * (h - 68) / 37
        m.line([(22, y), (28 if i % 2 else 34, y)], 1)
        m.line([(w - 22, y), (w - (28 if i % 2 else 34), y)], 1)
    # rosa dos ventos (sem letras)
    cx, cy, r = w - 190, h - 190, 92
    for k in range(32):
        a = k / 32 * 2 * math.pi
        rr = r * (1.0 if k % 8 == 0 else 0.72 if k % 4 == 0 else 0.5)
        m.line([(cx, cy), (cx + math.cos(a) * rr, cy + math.sin(a) * rr)], 1.1 if k % 4 == 0 else 0.6)
    for k in range(4):
        a = k / 4 * 2 * math.pi - math.pi / 2
        b1, b2 = a + math.pi / 2, a - math.pi / 2
        m.poly([(cx + math.cos(a) * r, cy + math.sin(a) * r), (cx + math.cos(b1) * 12, cy + math.sin(b1) * 12), (cx, cy), (cx + math.cos(b2) * 12, cy + math.sin(b2) * 12)])
    m.ellipse(cx, cy, 5, 5)
    ring = Mask(h, w, ss=2)
    ring.ellipse(cx, cy, r * 0.82, r * 0.82)
    inner = Mask(h, w, ss=2)
    inner.ellipse(cx, cy, r * 0.82 - 1.6, r * 0.82 - 1.6)
    a = np.clip(m.array() + ring.array() - inner.array(), 0, 1)
    return mix(img, hex2rgb(ink), a * 0.85)


def render_map(t, rivers, regions, version: str):
    X, Y = t['X'], t['Y']
    land, lake, elev = t['land'], t['lake'], t['elev']
    known = version == 'conhecido'
    if known:
        palette = {
            'ink': (38, 49, 60, 255), 'light': (232, 228, 214, 255), 'shade': (176, 176, 168, 255), 'hatch': (88, 98, 108, 200),
            'snow': (246, 244, 236, 255), 'crater': (90, 92, 96, 255), 'tree': (120, 130, 112, 255), 'ember': None, 'smoke': None,
        }
        ink, river_ink = '#26313c', '#3c5a6d'
        paper = parchment(X, Y, base='#e2ddcf', stain='#bdb5a0', seed=61)
    else:
        palette = {
            'ink': (64, 44, 26, 255), 'light': (238, 226, 196, 255), 'shade': (186, 160, 118, 255), 'hatch': (112, 84, 52, 210),
            'snow': (248, 244, 232, 255), 'crater': (70, 44, 34, 255), 'tree': (118, 124, 74, 255), 'ember': (178, 58, 30, 255), 'smoke': (110, 98, 90, 170),
        }
        ink, river_ink = '#40301f', '#476574'
        paper = parchment(X, Y, base='#e8dab9', stain='#c8a977', seed=41)

    # Mar
    near = blur(land.astype(F), 26)
    sea = mix(paper, hex2rgb('#a5b5ad' if not known else '#a2b1b6'), 0.5)
    sea = mix(sea, hex2rgb('#869c97' if not known else '#82939c'), smoothstep(0.32, 0.0, near) * 0.5)
    hatch = 0.5 + 0.5 * np.sin(Y * H * math.pi / 2.6)
    sea = multiply(sea, 1 - hatch * 0.03)
    ripple = np.zeros_like(X)
    for lvl, strength in ((0.43, 0.6), (0.33, 0.45), (0.23, 0.32), (0.14, 0.2)):
        ripple = np.maximum(ripple, smoothstep(0.011, 0.0, np.abs(near - lvl)) * strength)
    sea = mix(sea, hex2rgb(ink), ripple * (~land) * 0.5)

    # Terra: pergaminho levemente tingido pela altitude, com relevo sutil
    shade = hillshade(elev, z=700.0)
    e = np.clip(elev, 0, 1.2)
    if known:
        tint = ramp(e, [(0.0, '#dcd8c6'), (0.25, '#d6d0bd'), (0.6, '#cfc8b6'), (1.0, '#e6e2d6')])
    else:
        tint = ramp(e, [(0.0, '#d8cf9f'), (0.12, '#d6c99a'), (0.28, '#d8c294'), (0.5, '#cdb48a'), (1.0, '#e2d3b4')])
    land_rgb = mix(paper, tint, 0.65)
    land_rgb = multiply(land_rgb, 0.8 + 0.3 * np.clip(shade, 0, 1.2))

    safra = region_mask(regions['safra']) & land
    if not known:
        basalt = smoothstep(0.12, 0.35, elev) * safra
        land_rgb = mix(land_rgb, hex2rgb('#a48b74'), basalt * 0.45)

    img = np.where(land[..., None], land_rgb, sea).astype(F)
    lake_rgb = mix(paper, hex2rgb('#93a9a6' if not known else '#94a6ad'), 0.6)
    img = np.where(lake[..., None], lake_rgb, img).astype(F)

    # Rios
    rm = Mask(H, W, ss=2)
    for r in rivers:
        n = len(r)
        for i in range(0, n - 1, 3):
            rm.line(r[i : i + 4], 1.8 + 3.2 * (i / n))
    img = mix(img, hex2rgb(river_ink), rm.array() * land * 0.95)

    # Ícones
    g_rgb, g_a = glyph_layer(t, palette)
    img = mix(img, g_rgb, g_a)

    # Costa em tinta
    edge_src = blur((land & ~lake).astype(F), 1.2)
    coast = smoothstep(0.15, 0.5, edge_src) * smoothstep(0.85, 0.5, edge_src)
    lake_src = blur(lake.astype(F), 1.0)
    coast = np.maximum(coast, smoothstep(0.15, 0.5, lake_src) * smoothstep(0.85, 0.5, lake_src) * 0.8)

    if known:
        # Safra apagada: pergaminho em branco, sem relevo, rios ou ícones; costa pontilhada e névoa
        zone = blur(region_mask(regions['safra']).astype(F), 18)
        zone = np.clip(zone * 1.4, 0, 1) * smoothstep(0.0, 0.25, near + land.astype(F) * 0.25)
        blank = parchment(X, Y, base='#e4dfd1', stain='#cfc7b3', seed=71)
        fog = smoothstep(0.35, 0.9, Noise(72).fbm(X * 3, Y * 3, 6) * 0.5 + 0.5)
        blank = mix(blank, hex2rgb('#d9d4c6'), fog * 0.4)
        img = mix(img, blank, zone)
        dots = (np.sin(X * 1400) * np.sin(Y * 1400) > 0.2).astype(F)
        coast = coast * (1 - zone) + coast * zone * dots * 0.4

    img = mix(img, hex2rgb(ink), np.clip(coast, 0, 1) * 0.88)
    img = draw_frame(img, ink)
    img = vignette(img, 0.32 if not known else 0.22, 0.95)
    img = grain(img, 0.016, seed=5 if not known else 6)
    return img


# ── Exportação ─────────────────────────────────────────────────────────────


def export_heightmap(elev, path, size=(512, 320)):
    lo, hi = float(elev.min()), float(elev.max())
    norm = (elev - lo) / (hi - lo)
    small = np.asarray(Image.fromarray(norm.astype(np.float32), 'F').resize(size, Image.BOX), dtype=np.float64)
    v = np.clip(np.round(small * 65535), 0, 65535).astype(np.uint32)
    rgb = np.zeros(small.shape + (3,), dtype=np.uint8)
    rgb[..., 0] = (v >> 8).astype(np.uint8)
    rgb[..., 1] = (v & 255).astype(np.uint8)
    Image.fromarray(rgb, 'RGB').save(path, optimize=True)
    return lo, hi


def export_mask(land, path, size=(1200, 750)):
    img = Image.fromarray((land.astype(np.uint8) * 255), 'L').resize(size, Image.BOX)
    img.save(path, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.parent.mkdir(parents=True, exist_ok=True)
    regenerate = '--regenerar' in sys.argv or not DATA.exists()

    print('Relevo…')
    t = build_terrain()
    print('Rios…')
    rivers = trace_rivers(t)
    carve_rivers(t, rivers)

    if regenerate:
        polys = build_regions()
        data = json.loads(DATA.read_text()) if DATA.exists() else {}
        data['regioes'] = [
            {
                'id': key,
                'reino': key,
                'estado': 'conceitual',
                'rotulo': label_point(polys[key], t['land']),
                'poligono': polys[key],
            }
            for key in ORDER
        ]
    else:
        data = json.loads(DATA.read_text())
    regions = {r['id']: r['poligono'] for r in data['regioes']}

    print('Carta original…')
    save_webp(render_map(t, rivers, regions, 'original'), OUT / 'mapa-mundo-original.webp', quality=80)
    print('Carta conhecida…')
    save_webp(render_map(t, rivers, regions, 'conhecido'), OUT / 'mapa-mundo-conhecido.webp', quality=80)

    water = ~t['land'] | t['lake']
    lo, hi = export_heightmap(t['elev'], OUT / 'relevo-mundo.png')
    export_mask(~water, OUT / 'mascara-terra.png')

    data.update(
        {
            'estado': 'conceitual',
            'nota': 'Composição conceitual gerada proceduralmente. Posições, fronteiras, costas e rios não foram aprovados.',
            'largura': W,
            'altura': H,
            'relevo': {
                'arquivo': '/images/atlas/relevo-mundo.png',
                'codificacao': 'rg16',
                'largura': 512,
                'altura': 320,
                'nivelDoMar': round((0 - lo) / (hi - lo), 5),
            },
            'mascaraTerra': '/images/atlas/mascara-terra.png',
        }
    )
    ordered = {k: data[k] for k in ['estado', 'nota', 'largura', 'altura', 'relevo', 'mascaraTerra', 'regioes']}
    DATA.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + '\n')
    print('Pronto.')


if __name__ == '__main__':
    main()
