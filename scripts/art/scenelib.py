"""
Kit de cena: céu, nuvens, cordilheiras, névoa, água, árvores, arquitetura,
chamas, fumaça, figuras e a silhueta do dragão — tudo procedural.
"""

from __future__ import annotations

import math

import numpy as np

from artlib import (
    F,
    Mask,
    Noise,
    blur,
    catmull,
    fill_below,
    glow,
    grid,
    hex2rgb,
    mix,
    multiply,
    ramp,
    ridge_line,
    smoothstep,
    tapered_stroke,
)


class Canvas:
    def __init__(self, w: int, h: int, scale: float = 1.0):
        self.w, self.h, self.s = int(w * scale), int(h * scale), scale
        self.X, self.Y = grid(self.h, self.w)
        self.u = self.X / (self.w / self.h)  # 0..1 horizontal
        self.img = np.zeros((self.h, self.w, 3), dtype=F)

    def px(self, fx, fy):
        return fx * self.w, fy * self.h

    def paint(self, color, alpha):
        c = hex2rgb(color) if isinstance(color, str) else color
        self.img = mix(self.img, c, np.clip(alpha, 0, 1))

    def light(self, color, intensity):
        c = hex2rgb(color) if isinstance(color, str) else color
        self.img = np.clip(self.img + c * intensity[..., None], 0, 1).astype(F)


# ── Céu e atmosfera ────────────────────────────────────────────────────────


def sky(cv: Canvas, stops):
    v = cv.Y
    cv.img = ramp(v, stops)


def clouds(cv: Canvas, seed, color, y0, y1, density=0.5, stretch=3.0, scale=2.5, opacity=0.8, soft=0.25):
    n = Noise(seed)
    f = n.fbm(cv.X * scale / stretch, cv.Y * scale * 1.6, 7) * 0.5 + 0.5
    band = smoothstep(y0, y0 + (y1 - y0) * 0.3, cv.Y) * smoothstep(y1, y1 - (y1 - y0) * 0.3, cv.Y)
    a = smoothstep(1 - density, 1 - density + soft, f) * band * opacity
    cv.paint(color, a)
    return a


def stars(cv: Canvas, seed, count, ymax=0.6, brightness=0.8):
    rng = np.random.default_rng(seed)
    m = Mask(cv.h, cv.w, ss=2)
    for _ in range(count):
        x, y = rng.random() * cv.w, rng.random() ** 1.6 * ymax * cv.h
        r = rng.choice([0.5, 0.6, 0.8, 1.1], p=[0.5, 0.3, 0.15, 0.05])
        m.ellipse(x, y, r, r, int(255 * rng.uniform(0.3, 1.0)))
    cv.light('#f2ead8', m.array() * brightness)


def fog(cv: Canvas, seed, color, y_center, thickness, opacity=0.7, scale=3.0):
    n = Noise(seed)
    f = n.fbm(cv.X * scale, cv.Y * scale * 3, 6) * 0.5 + 0.5
    band = np.exp(-(((cv.Y - y_center) / thickness) ** 2))
    cv.paint(color, band * smoothstep(0.25, 0.75, f) * opacity + band * 0.25 * opacity)


def haze(cv: Canvas, color, y_from, y_to, opacity):
    cv.paint(color, smoothstep(y_from, y_to, cv.Y) * opacity)


def sun_glow(cv: Canvas, fx, fy, color, radius, intensity=0.8, power=1.4):
    cv.light(color, glow(cv.h, cv.w, fx, fy, radius, power) * intensity)


def light_rays(cv: Canvas, fx, fy, color, count=18, spread=1.2, length=1.2, intensity=0.12, seed=3, angle=math.pi / 2):
    rng = np.random.default_rng(seed)
    ax = cv.w / cv.h
    dx = cv.X - fx * ax
    dy = cv.Y - fy
    theta = np.arctan2(dy, dx)
    dist = np.sqrt(dx * dx + dy * dy)
    rays = np.zeros_like(cv.X)
    for _ in range(count):
        t = angle + rng.uniform(-spread / 2, spread / 2)
        width = rng.uniform(0.008, 0.035)
        d = np.abs(np.angle(np.exp(1j * (theta - t))))
        rays += np.exp(-((d / width) ** 2)) * rng.uniform(0.4, 1.0)
    rays *= np.exp(-dist / length)
    cv.light(color, np.clip(rays, 0, 1.5) * intensity)


# ── Terreno em camadas ─────────────────────────────────────────────────────


def ridge_layer(cv: Canvas, seed, base, amp, freq, color, rim=None, rim_side=1, texture=0.15, ridged=False, octaves=7, light_dir=-1):
    """Uma camada de montanhas: retorna a linha (em px) e a máscara."""
    n = Noise(seed)
    line = ridge_line(n, cv.w, base * cv.h, amp * cv.h, freq, octaves, offset=seed * 0.37, ridged=ridged)
    mask = fill_below(cv.h, cv.w, line)
    col = np.broadcast_to(hex2rgb(color), (cv.h, cv.w, 3)).astype(F)
    # sombreamento das encostas pela derivada da linha de cume
    slope = np.gradient(line)
    face = np.clip(0.5 + light_dir * slope * 0.12, 0, 1)
    depth = smoothstep(0, amp * cv.h * 1.2, (np.arange(cv.h, dtype=F)[:, None] - line[None, :]))
    shade = 0.8 + 0.4 * face[None, :] * (1 - depth)
    tex = Noise(seed + 100).fbm(cv.X * 14, cv.Y * 30, 5)
    col = multiply(col, shade + tex * texture)
    cv.img = mix(cv.img, col, mask)
    if rim is not None:
        edge = np.clip(1 - (np.arange(cv.h, dtype=F)[:, None] - line[None, :]) / 3.5, 0, 1) * mask
        lit = np.clip(0.5 + rim_side * slope * 0.25, 0, 1)[None, :]
        cv.light(rim, edge * lit * 0.8)
    return line, mask


def snow(cv: Canvas, line, mask, depth_px, color='#e8e6e0', seed=9, threshold=0.5):
    n = Noise(seed)
    y = np.arange(cv.h, dtype=F)[:, None]
    below = y - line[None, :]
    peaks = smoothstep(np.percentile(line, 35), np.percentile(line, 5), line)[None, :]
    streak = n.fbm(cv.X * 30, cv.Y * 8, 5) * 0.5 + 0.5
    a = (below < depth_px * (0.6 + streak)) * peaks * mask * smoothstep(threshold - 0.2, threshold + 0.2, streak)
    cv.paint(color, blur(a.astype(F), 1) * 0.85)


def water(cv: Canvas, horizon, color, reflect=True, ripple=0.004, darken=0.65, seed=5):
    """Superfície de água abaixo da linha do horizonte, com reflexo ondulado."""
    h0 = int(horizon * cv.h)
    if h0 >= cv.h:
        return
    rows = cv.h - h0
    below = cv.img[h0:].copy()
    if reflect:
        src = np.clip(2 * h0 - np.arange(h0, cv.h) - 1, 0, cv.h - 1)
        n = Noise(seed)
        off = (n.fbm(cv.X[h0:] * 3, cv.Y[h0:] * 120, 3) * ripple * cv.w).astype(int)
        cols = np.clip(np.arange(cv.w)[None, :] + off, 0, cv.w - 1)
        refl = cv.img[src[:, None], cols]
        below = mix(below, refl, 0.8)
    below = mix(below * darken, hex2rgb(color), 0.3)
    shimmer = smoothstep(0.3, 0.6, Noise(seed + 1).fbm(cv.X[h0:] * 2, cv.Y[h0:] * 220, 3)) * 0.05
    depth = np.linspace(0, 1, rows, dtype=F)[:, None, None]
    cv.img[h0:] = np.clip(below * (1 - depth * 0.25) + shimmer[..., None], 0, 1)


# ── Vegetação ──────────────────────────────────────────────────────────────


def forest(m: Mask, x0, x1, base_y, height, rng, density=1.0, kind='mixed', jitter=0.25):
    x = x0
    while x < x1:
        hh = height * rng.uniform(0.6, 1.2)
        y = base_y + rng.uniform(-jitter, jitter) * height
        k = kind if kind != 'mixed' else ('pine' if rng.random() < 0.55 else 'round')
        if k == 'pine':
            w = hh * 0.32
            tiers = 3
            for t in range(tiers):
                ty = y - hh * (t / tiers) * 0.9
                tw = w * (1 - t / (tiers + 0.5))
                m.poly([(x, ty - hh * 0.55), (x + tw, ty), (x - tw, ty)])
            m.rect(x - hh * 0.03, y - hh * 0.05, x + hh * 0.03, y + hh * 0.08)
        elif k == 'cypress':
            m.ellipse(x, y - hh * 0.55, hh * 0.13, hh * 0.55)
        else:
            r = hh * 0.32
            for _ in range(3):
                m.ellipse(x + rng.uniform(-r * 0.6, r * 0.6), y - hh * 0.55 + rng.uniform(-r * 0.4, r * 0.4), r, r * 0.85)
            m.rect(x - hh * 0.03, y - hh * 0.3, x + hh * 0.03, y + hh * 0.05)
        x += hh * rng.uniform(0.18, 0.45) / max(density, 0.05)


# ── Arquitetura ────────────────────────────────────────────────────────────


def building(m: Mask, x, base, w, h, rng, style, windows: list, lit=0.5):
    """Edifício de arquitetura fantástica; registra algumas janelas iluminadas."""
    kinds = {
        'safra': ['dome', 'tower', 'stepped', 'hall', 'dome', 'tower'],
        'aurelion': ['temple', 'dome', 'hall', 'tower', 'temple'],
        'nacaris': ['house', 'house', 'tower', 'hall', 'house'],
        'kharveth': ['keep', 'keep', 'wall', 'tower'],
        'elyndor': ['dome', 'tower', 'hall', 'cypress'],
        'brumafunda': ['house', 'house', 'house'],
        'ruins': ['broken', 'broken', 'arch', 'broken'],
    }.get(style, ['hall', 'tower'])
    kind = kinds[int(rng.integers(len(kinds)))]
    top = base - h

    def win(wx, wy, ww, wh):
        if rng.random() < lit:
            windows.append((wx, wy, ww, wh))

    if kind == 'dome':
        m.rect(x - w / 2, top, x + w / 2, base)
        r = w * 0.48
        m.ellipse(x, top, r, r * rng.uniform(0.85, 1.2))
        m.rect(x - w * 0.05, top - r * 1.25, x + w * 0.05, top - r * 0.7)
        m.ellipse(x, top - r * 1.3, w * 0.06, w * 0.06)
        for k in range(int(rng.integers(1, 4))):
            win(x - w * 0.3 + k * w * 0.3, top + h * 0.45, w * 0.06, h * 0.12)
    elif kind == 'tower':
        tw = w * 0.45
        m.rect(x - tw / 2, top - h * 0.6, x + tw / 2, base)
        if rng.random() < 0.5:
            m.poly([(x - tw * 0.7, top - h * 0.6), (x, top - h * 0.6 - tw * rng.uniform(1.4, 2.6)), (x + tw * 0.7, top - h * 0.6)])
        else:
            m.ellipse(x, top - h * 0.6, tw * 0.62, tw * 0.75)
        m.rect(x - tw * 0.75, top - h * 0.2, x + tw * 0.75, top - h * 0.12)
        for k in range(3):
            win(x, top - h * 0.45 + k * h * 0.35, tw * 0.16, h * 0.08)
    elif kind == 'stepped':
        tiers = 3
        for k in range(tiers):
            tw = w * (1 - k * 0.27)
            ty = base - h * (k + 1) / tiers * 1.1
            m.rect(x - tw / 2, ty, x + tw / 2, base - h * k / tiers * 1.1)
        m.rect(x - w * 0.07, base - h * 1.3, x + w * 0.07, base - h * 1.1)
        win(x - w * 0.2, base - h * 0.2, w * 0.06, h * 0.1)
        win(x + w * 0.2, base - h * 0.2, w * 0.06, h * 0.1)
        win(x, base - h * 0.55, w * 0.06, h * 0.1)
    elif kind == 'temple':
        m.rect(x - w * 0.6, base - h * 0.12, x + w * 0.6, base)
        cols = 6
        for k in range(cols):
            cx = x - w * 0.5 + k * w / (cols - 1)
            m.rect(cx - w * 0.035, top + h * 0.2, cx + w * 0.035, base - h * 0.1)
        m.rect(x - w * 0.58, top + h * 0.1, x + w * 0.58, top + h * 0.22)
        m.poly([(x - w * 0.62, top + h * 0.11), (x, top - h * 0.12), (x + w * 0.62, top + h * 0.11)])
        win(x, base - h * 0.4, w * 0.12, h * 0.3)
    elif kind == 'hall':
        m.rect(x - w * 0.6, top + h * 0.35, x + w * 0.6, base)
        m.poly([(x - w * 0.66, top + h * 0.36), (x, top + h * 0.05), (x + w * 0.66, top + h * 0.36)])
        for k in range(4):
            win(x - w * 0.42 + k * w * 0.28, base - h * 0.32, w * 0.07, h * 0.14)
    elif kind == 'house':
        hh = h * 0.45
        m.rect(x - w * 0.4, base - hh, x + w * 0.4, base)
        m.poly([(x - w * 0.5, base - hh), (x, base - hh - w * 0.45), (x + w * 0.5, base - hh)])
        if rng.random() < 0.5:
            m.rect(x + w * 0.15, base - hh - w * 0.45, x + w * 0.25, base - hh - w * 0.15)
        win(x - w * 0.15, base - hh * 0.5, w * 0.1, hh * 0.22)
    elif kind == 'keep':
        m.rect(x - w / 2, top, x + w / 2, base)
        n = 5
        for k in range(n):
            if k % 2 == 0:
                cx = x - w / 2 + (k + 0.5) * w / n
                m.rect(cx - w / n / 2, top - w * 0.14, cx + w / n / 2, top)
        for k in range(2):
            win(x - w * 0.15 + k * w * 0.3, top + h * 0.3, w * 0.05, h * 0.1)
    elif kind == 'wall':
        m.rect(x - w * 0.7, base - h * 0.35, x + w * 0.7, base)
        for k in range(7):
            if k % 2 == 0:
                cx = x - w * 0.7 + (k + 0.5) * w * 1.4 / 7
                m.rect(cx - w * 0.1, base - h * 0.35 - w * 0.12, cx + w * 0.1, base - h * 0.35)
    elif kind == 'cypress':
        m.ellipse(x, base - h * 0.45, w * 0.13, h * 0.5)
    elif kind == 'broken':
        jag = [(x - w / 2, base), (x - w / 2, top + h * rng.uniform(0.0, 0.4))]
        for k in range(1, 5):
            jag.append((x - w / 2 + k * w / 5, top + h * rng.uniform(0.0, 0.7)))
        jag += [(x + w / 2, top + h * rng.uniform(0.2, 0.8)), (x + w / 2, base)]
        m.poly(jag)
    elif kind == 'arch':
        m.rect(x - w * 0.6, top + h * 0.15, x - w * 0.38, base)
        m.rect(x + w * 0.38, top + h * 0.15, x + w * 0.6, base)
        m.rect(x - w * 0.6, top + h * 0.05, x + w * 0.05, top + h * 0.2)


def city(m: Mask, x0, x1, base_fn, scale, rng, style='safra', density=1.0, lit=0.5, max_h=1.0):
    windows: list = []
    x = x0
    while x < x1:
        w = scale * rng.uniform(0.6, 1.5)
        h = scale * rng.uniform(0.7, 2.2) * max_h
        building(m, x, base_fn(x), w, h, rng, style, windows, lit)
        x += w * rng.uniform(0.5, 0.95) / density
    return windows


def lights(cv: Canvas, windows, color='#ffc46b', intensity=1.0, bloom=3.0):
    m = Mask(cv.h, cv.w, ss=2)
    for x, y, w, h in windows:
        m.rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2)
    a = m.array()
    cv.light(color, a * intensity)
    cv.light(color, blur(a, bloom) * intensity * 0.9)


def figure(m: Mask, x, base, h):
    """Figura humana minúscula, de costas e sem rosto."""
    m.ellipse(x, base - h * 0.88, h * 0.09, h * 0.1)
    m.poly([(x - h * 0.16, base), (x - h * 0.09, base - h * 0.75), (x + h * 0.09, base - h * 0.75), (x + h * 0.18, base)])


# ── Fogo e fumaça ──────────────────────────────────────────────────────────


def flame(cv: Canvas, fx, base, height, width, seed=1, intensity=1.0, warmth=0.0):
    """Campo de intensidade de uma chama (coordenadas fracionárias)."""
    n = Noise(seed)
    ax = cv.w / cv.h
    x = (cv.X - fx * ax) / width
    y = (base - cv.Y) / height
    warp = n.fbm(cv.X * 6, cv.Y * 4 + 3, 5) * 0.55
    xs = x + warp * np.clip(y, 0, 1.4)
    profile = np.clip(1 - y, 0, 1) ** 0.6 * np.clip(y * 6 + 0.4, 0, 1)
    tongues = n.fbm(cv.X * 9, cv.Y * 3.5, 5) * 0.5 + 0.5
    core = np.exp(-(xs**2) / (0.08 + 0.35 * profile + 1e-3)) * profile
    f = np.clip(core * (0.6 + 0.8 * tongues), 0, 1.5) * (y > -0.05)
    colors = ramp(np.clip(f, 0, 1), [(0.0, '#000000'), (0.18, '#4a0f07'), (0.38, '#9c2c14'), (0.58, '#e06a1c'), (0.78, '#f4b54a'), (1.0, '#fff2cf')])
    cv.img = np.clip(cv.img + colors * intensity, 0, 1).astype(F)
    return f


def smoke(cv: Canvas, seed, fx, base, height, width, color, opacity=0.8, lean=0.15):
    n = Noise(seed)
    ax = cv.w / cv.h
    y = np.clip((base - cv.Y) / height, 0, 1.6)
    centre = fx * ax + lean * y
    spread = width * (0.3 + y * 1.4)
    x = (cv.X - centre) / spread
    puff = n.fbm(cv.X * 5, cv.Y * 5 + 7, 6) * 0.5 + 0.5
    a = np.exp(-(x**2) * 2) * smoothstep(0.0, 0.15, y) * smoothstep(1.6, 0.6, y) * smoothstep(0.3, 0.7, puff + 0.25)
    cv.paint(color, a * opacity)
    return a


def embers(cv: Canvas, seed, fx, fy, spread, count, color='#ffb05a'):
    rng = np.random.default_rng(seed)
    m = Mask(cv.h, cv.w, ss=2)
    for _ in range(count):
        x = (fx + rng.normal(0, spread)) * cv.w
        y = (fy - abs(rng.normal(0, spread * 1.6))) * cv.h
        r = rng.uniform(0.6, 1.8)
        m.ellipse(x, y, r, r)
    a = m.array()
    cv.light(color, a)
    cv.light(color, blur(a, 2) * 0.6)


# ── Dragão ─────────────────────────────────────────────────────────────────


def dragon(m: Mask, cx, cy, s, flip=False, far: Mask | None = None):
    """Silhueta de dragão em voo, asas erguidas; centrada em (cx, cy), escala s (px)."""
    sign = -1 if flip else 1

    def P(x, y):
        return (cx + sign * x * s, cy + y * s)

    spine = catmull([(-1.9, 0.38), (-1.5, 0.44), (-1.05, 0.3), (-0.6, 0.12), (-0.2, 0.02), (0.2, 0.0), (0.5, -0.1), (0.7, -0.3), (0.82, -0.52), (0.95, -0.62)], 18)
    m.poly(tapered_stroke([P(x, y) for x, y in spine], [s * 0.012, s * 0.035, s * 0.08, s * 0.15, s * 0.22, s * 0.2, s * 0.13, s * 0.095, s * 0.085, s * 0.08]))
    # ponta da cauda
    m.poly([P(-1.9, 0.38), P(-2.05, 0.3), P(-1.98, 0.42), P(-2.08, 0.5), P(-1.88, 0.42)])
    # cabeça e chifres
    head = [(0.9, -0.6), (1.0, -0.71), (1.12, -0.7), (1.33, -0.61), (1.34, -0.58), (1.24, -0.54), (1.1, -0.52), (0.98, -0.52)]
    m.poly([P(x, y) for x, y in head])
    m.poly([P(1.0, -0.69), P(0.84, -0.86), P(1.06, -0.71)])
    m.poly([P(0.96, -0.66), P(0.8, -0.76), P(1.0, -0.63)])
    m.poly([P(1.1, -0.53), P(1.3, -0.5), P(1.12, -0.48)])
    # espinhos dorsais
    for i in range(10, len(spine) - 20, 6):
        x, y = spine[i]
        m.poly([P(x - 0.035, y - 0.04), P(x - 0.06, y - 0.15), P(x + 0.03, y - 0.05)])
    # pernas com garras
    m.poly(tapered_stroke([P(0.12, 0.1), P(0.26, 0.3), P(0.17, 0.46)], [s * 0.09, s * 0.06, s * 0.03]))
    m.poly([P(0.17, 0.46), P(0.26, 0.5), P(0.14, 0.5)])
    m.poly(tapered_stroke([P(-0.62, 0.18), P(-0.5, 0.42), P(-0.66, 0.58)], [s * 0.1, s * 0.07, s * 0.03]))
    m.poly([P(-0.66, 0.58), P(-0.56, 0.62), P(-0.7, 0.63)])

    def wing(shoulder, elbow, wrist, fingers, body_pt, depth=0.34, target=None):
        mm = target or m
        mm.poly(tapered_stroke([P(*shoulder), P(*elbow)], [s * 0.075, s * 0.05]))
        mm.poly(tapered_stroke([P(*elbow), P(*wrist)], [s * 0.05, s * 0.035]))
        for f in fingers:
            mm.poly(tapered_stroke([P(*wrist), P(*f)], [s * 0.028, s * 0.008]))
        pts = [shoulder, elbow, wrist, fingers[0]]
        chain = fingers + [body_pt]
        for a, b in zip(chain[:-1], chain[1:]):
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            pull = wrist if b is not body_pt else ((wrist[0] + body_pt[0]) / 2, (wrist[1] + body_pt[1]) / 2)
            pts.append((mid[0] + (pull[0] - mid[0]) * depth, mid[1] + (pull[1] - mid[1]) * depth))
            pts.append(b)
        mm.poly([P(x, y) for x, y in pts])

    wing((0.05, -0.08), (0.18, -0.48), (-0.12, -0.92), [(-0.5, -1.08), (-0.86, -0.9), (-1.02, -0.58)], (-0.6, 0.02), 0.45, far)
    wing((0.22, -0.05), (0.58, -0.62), (0.32, -1.22), [(-0.14, -1.58), (-0.62, -1.38), (-0.98, -1.02), (-1.12, -0.6)], (-0.42, 0.06), 0.5)
