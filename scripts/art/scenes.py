"""
Ilustrações do Atlas (conceitos artísticos procedurais).

Uso:
  python3 scripts/art/scenes.py                 # todas, em resolução final
  python3 scripts/art/scenes.py capa reino-nacaris --preview   # algumas, em 40%
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from artlib import F, Mask, Noise, blur, glow, grain, hex2rgb, mix, multiply, save_webp, smoothstep, tone, vignette  # noqa: E402
from scenelib import (  # noqa: E402
    Canvas,
    city,
    clouds,
    dragon,
    embers,
    figure,
    flame,
    fog,
    forest,
    haze,
    light_rays,
    lights,
    ridge_layer,
    sky,
    smoke,
    snow,
    stars,
    sun_glow,
    water,
)

OUT = Path(__file__).resolve().parents[2] / 'public' / 'images' / 'atlas'
SCENES = {}


def scene(name, w, h):
    def deco(fn):
        SCENES[name] = (fn, w, h)
        return fn

    return deco


def finish(cv: Canvas, seed=1, vig=0.5, grain_amount=0.022, contrast=1.05):
    cv.img = tone(cv.img, contrast=contrast)
    cv.img = vignette(cv.img, vig, 0.85)
    cv.img = grain(cv.img, grain_amount, seed)
    return cv.img


def silhouette(cv: Canvas, m: Mask, color, alpha=1.0):
    a = m.array() * alpha
    cv.paint(color, a)
    return a


# ── 3.1 Capa do Atlas ─────────────────────────────────────────────────────


@scene('capa-atlas', 1200, 1800)
def capa(cv: Canvas):
    rng = np.random.default_rng(101)
    sky(cv, [(0.0, '#06070a'), (0.35, '#0d0c10'), (0.62, '#2a120d'), (0.8, '#4a1b0e'), (1.0, '#1a0c08')])
    stars(cv, 3, int(260 * cv.s * cv.s), ymax=0.4, brightness=0.6)
    clouds(cv, 11, '#1c1416', 0.08, 0.55, density=0.55, stretch=2.2, scale=2.2, opacity=0.7)
    sun_glow(cv, 0.5, 0.66, '#c2471b', 0.42, 0.85, 1.6)
    sun_glow(cv, 0.5, 0.62, '#f0a44a', 0.14, 0.55, 2.0)
    smoke(cv, 12, 0.5, 0.66, 0.6, 0.12, '#251612', 0.55, lean=0.06)
    light_rays(cv, 0.5, 0.64, '#e88a3a', count=22, spread=2.6, length=0.9, intensity=0.06, angle=-math.pi / 2)

    # O dragão envolve a chama, contra a luz
    m = Mask(cv.h, cv.w)
    far = Mask(cv.h, cv.w)
    dragon(m, cv.w * 0.6, cv.h * 0.43, cv.w * 0.26, flip=False, far=far)
    cv.paint('#2a1510', far.array())
    a = m.array()
    rim = np.clip(a - np.roll(blur(a, 3 * cv.s), (int(-3 * cv.s), int(4 * cv.s)), axis=(0, 1)), 0, 1)
    cv.paint('#0b0706', a)
    cv.light('#e9873d', rim * 0.9)

    # A chama
    flame(cv, 0.5, 0.72, 0.3, 0.075, seed=4, intensity=1.25)
    flame(cv, 0.47, 0.72, 0.18, 0.05, seed=8, intensity=0.6)
    embers(cv, 5, 0.5, 0.62, 0.09, int(140 * cv.s))

    # Cidade monumental em três planos
    for k, (base, scale, col, lit) in enumerate([(0.75, 30, '#3d1f16', 0.35), (0.83, 44, '#28140e', 0.45), (0.94, 66, '#140a07', 0.5)]):
        m = Mask(cv.h, cv.w)
        jitter = Noise(200 + k)
        base_px = base * cv.h
        wins = city(m, -20, cv.w + 20, lambda x, b=base_px: b + float(jitter(x * 0.004, 0)) * 26 * cv.s, scale * cv.s, rng, 'safra', density=0.95, lit=lit, max_h=1.0 + k * 0.2)
        m.rect(-10, base_px + 6 * cv.s, cv.w + 10, cv.h)
        if k == 0:
            # torres monumentais ao fundo
            for tx in (0.3, 0.68):
                m.rect(cv.w * tx - 14 * cv.s, cv.h * 0.56, cv.w * tx + 14 * cv.s, base_px)
                m.poly([(cv.w * tx - 20 * cv.s, cv.h * 0.56), (cv.w * tx, cv.h * 0.49), (cv.w * tx + 20 * cv.s, cv.h * 0.56)])
        silhouette(cv, m, col)
        lights(cv, wins, '#f2a24a', 0.55 - k * 0.1, bloom=2.5 * cv.s)
        haze(cv, '#3a1a10', base - 0.12, base + 0.02, 0.18)
        fog(cv, 30 + k, '#3b1f17', base + 0.02, 0.025, 0.35, scale=3)

    cv.light('#b8501e', glow(cv.h, cv.w, 0.5, 0.8, 0.5, 1.6) * 0.18)
    # Espaço escuro no topo para o título em HTML
    cv.paint('#050506', smoothstep(0.38, 0.0, cv.Y) * 0.55)
    return finish(cv, 7, vig=0.6)



# ── 3.5 Panoramas dos reinos ──────────────────────────────────────────────


def ground(cv: Canvas, seed, base, amp, color, freq=1.5):
    return ridge_layer(cv, seed, base, amp, freq, color, texture=0.08, octaves=5)


@scene('reino-safra', 2400, 1000)
def reino_safra(cv: Canvas):
    rng = np.random.default_rng(201)
    sky(cv, [(0.0, '#120a10'), (0.45, '#3b1414'), (0.7, '#7a2a14'), (1.0, '#2a0e08')])
    clouds(cv, 21, '#2a1012', 0.05, 0.5, density=0.5, stretch=4, opacity=0.6)
    sun_glow(cv, 0.62, 0.62, '#c4451a', 0.5, 0.5)
    for i, (vx, vh) in enumerate([(0.28, 0.32), (0.66, 0.42), (0.86, 0.26)]):
        m = Mask(cv.h, cv.w)
        bx, by = vx * cv.w, 0.66 * cv.h
        top = by - vh * cv.h
        m.poly([(bx - 0.22 * cv.w, by), (bx - 0.035 * cv.w, top), (bx + 0.035 * cv.w, top), (bx + 0.24 * cv.w, by)])
        silhouette(cv, m, ['#3a1a16', '#2c1412', '#3a1a16'][i])
        cv.light('#ff7a2a', glow(cv.h, cv.w, vx, top / cv.h + 0.005, 0.03, 2) * 0.9)
        smoke(cv, 22 + i, vx, top / cv.h, 0.45, 0.05, '#1f1312', 0.6, lean=0.12)
    line, _ = ridge_layer(cv, 23, 0.7, 0.06, 2.5, '#231210', rim='#d0602a', texture=0.1)
    m = Mask(cv.h, cv.w)
    wins = city(m, 0.08 * cv.w, 0.62 * cv.w, lambda x: float(line[min(int(x), cv.w - 1)]) + 4 * cv.s, 20 * cv.s, rng, 'safra', density=1.0, lit=0.55)
    silhouette(cv, m, '#1d0f0c')
    lights(cv, wins, '#ffb057', 0.7, 2 * cv.s)
    fog(cv, 24, '#4a1c12', 0.74, 0.04, 0.4)
    ground(cv, 25, 0.86, 0.08, '#120907')
    for bx in (0.18, 0.47, 0.79):
        flame(cv, bx, 0.84, 0.05, 0.008, seed=int(bx * 100), intensity=0.9)
        cv.light('#ff8a3a', glow(cv.h, cv.w, bx, 0.83, 0.06, 2) * 0.25)
    embers(cv, 26, 0.5, 0.75, 0.25, int(160 * cv.s))
    return finish(cv, 21)


@scene('reino-aurelion', 2400, 1000)
def reino_aurelion(cv: Canvas):
    rng = np.random.default_rng(202)
    sky(cv, [(0.0, '#5d6f86'), (0.4, '#c9a46e'), (0.62, '#e9c27d'), (1.0, '#a0743d')])
    clouds(cv, 31, '#f1d7a4', 0.05, 0.4, density=0.45, stretch=4, opacity=0.5)
    sun_glow(cv, 0.3, 0.5, '#fff0c2', 0.3, 0.6)
    ridge_layer(cv, 32, 0.5, 0.1, 1.6, '#8e8a8e', texture=0.05)
    haze(cv, '#e2c38c', 0.3, 0.6, 0.35)
    line, _ = ridge_layer(cv, 33, 0.58, 0.07, 2.2, '#7a7148', rim='#ffe2a0', texture=0.08)
    # campos férteis em perspectiva
    n = Noise(34)
    field_mask = smoothstep(0.6, 0.62, cv.Y)
    stripes = (np.sin((cv.X * 18 + n.fbm(cv.X * 2, cv.Y * 2, 3) * 4) * (1 + (cv.Y - 0.6) * 6)) > 0).astype(F)
    fields = mix(hex2rgb('#8a8a3e') * np.ones_like(cv.img), hex2rgb('#c0a653'), stripes * 0.7)
    fields = multiply(fields, 0.85 + 0.3 * (n.fbm(cv.X * 8, cv.Y * 20, 4) * 0.5 + 0.5))
    cv.img = mix(cv.img, fields, field_mask)
    river = np.exp(-(((cv.u - 0.55 - 0.08 * np.sin(cv.Y * 30)) / (0.004 + (cv.Y - 0.6) * 0.05)) ** 2)) * field_mask
    cv.paint('#f5e2b0', river * 0.8)
    m = Mask(cv.h, cv.w)
    hill = lambda x: 0.57 * cv.h + ((x - 0.72 * cv.w) / (0.2 * cv.w)) ** 2 * 0.06 * cv.h
    m.poly([(0.5 * cv.w, cv.h * 0.62), (0.72 * cv.w, cv.h * 0.55), (0.95 * cv.w, cv.h * 0.62)])
    wins = city(m, 0.6 * cv.w, 0.86 * cv.w, lambda x: min(hill(x), 0.62 * cv.h), 22 * cv.s, rng, 'aurelion', density=1.1, lit=0.15, max_h=1.2)
    silhouette(cv, m, '#6b5a3e')
    cv.light('#ffe6a8', m.array() * smoothstep(0.75, 0.6, cv.u) * 0.12)
    m = Mask(cv.h, cv.w)
    forest(m, 0, cv.w, 0.93 * cv.h, 70 * cv.s, rng, density=0.9, kind='round')
    silhouette(cv, m, '#2e3018')
    return finish(cv, 22, vig=0.4)


@scene('reino-nacaris', 2400, 1000)
def reino_nacaris(cv: Canvas):
    rng = np.random.default_rng(203)
    sky(cv, [(0.0, '#1d3242'), (0.5, '#5c7f8a'), (0.62, '#d8b98a'), (1.0, '#3a5560')])
    clouds(cv, 41, '#e7d1b0', 0.1, 0.5, density=0.5, stretch=5, opacity=0.55)
    sun_glow(cv, 0.55, 0.6, '#ffd9a0', 0.25, 0.6)
    horizon = 0.6
    water(cv, horizon, '#2d4c58', reflect=True, ripple=0.006)
    # navios
    for sx, sy, sc in [(0.42, 0.63, 1.0), (0.6, 0.615, 0.6), (0.3, 0.68, 1.4), (0.7, 0.64, 0.8)]:
        m = Mask(cv.h, cv.w)
        x, y, k = sx * cv.w, sy * cv.h, sc * 26 * cv.s
        m.poly([(x - 2.2 * k, y), (x + 2.4 * k, y), (x + 1.6 * k, y + 0.5 * k), (x - 1.6 * k, y + 0.5 * k)])
        m.rect(x - 0.06 * k, y - 3.2 * k, x + 0.06 * k, y)
        m.poly([(x + 0.1 * k, y - 3.0 * k), (x + 1.7 * k, y - 0.4 * k), (x + 0.1 * k, y - 0.3 * k)])
        m.poly([(x - 0.1 * k, y - 2.6 * k), (x - 1.4 * k, y - 0.5 * k), (x - 0.1 * k, y - 0.4 * k)])
        silhouette(cv, m, '#1a2026')
    # falésias e cidade costeira
    for side in (0, 1):
        m = Mask(cv.h, cv.w)
        if side == 0:
            pts = [(0, 0.38 * cv.h), (0.12 * cv.w, 0.42 * cv.h), (0.2 * cv.w, 0.5 * cv.h), (0.24 * cv.w, 0.7 * cv.h), (0.2 * cv.w, cv.h), (0, cv.h)]
        else:
            pts = [(cv.w, 0.45 * cv.h), (0.86 * cv.w, 0.5 * cv.h), (0.8 * cv.w, 0.56 * cv.h), (0.78 * cv.w, 0.75 * cv.h), (0.82 * cv.w, cv.h), (cv.w, cv.h)]
        m.poly(pts)
        silhouette(cv, m, '#25303a')
    m = Mask(cv.h, cv.w)
    wins = city(m, -10, 0.2 * cv.w, lambda x: 0.4 * cv.h + x / cv.w * 0.5 * cv.h, 18 * cv.s, rng, 'nacaris', density=1.2, lit=0.5)
    wins += city(m, 0.82 * cv.w, cv.w + 10, lambda x: 0.56 * cv.h - (x - 0.8 * cv.w) / cv.w * 0.5 * cv.h, 18 * cv.s, rng, 'nacaris', density=1.2, lit=0.5)
    # farol
    lx = 0.19 * cv.w
    m.poly([(lx - 10 * cv.s, 0.5 * cv.h), (lx - 6 * cv.s, 0.3 * cv.h), (lx + 6 * cv.s, 0.3 * cv.h), (lx + 10 * cv.s, 0.5 * cv.h)])
    m.rect(lx - 9 * cv.s, 0.28 * cv.h, lx + 9 * cv.s, 0.3 * cv.h)
    silhouette(cv, m, '#1a2129')
    lights(cv, wins, '#ffcf7a', 0.7, 2 * cv.s)
    cv.light('#fff1c4', glow(cv.h, cv.w, 0.19, 0.29, 0.02, 2) * 1.2)
    light_rays(cv, 0.19, 0.29, '#fff1c4', count=2, spread=0.25, length=0.8, intensity=0.18, angle=0.05)
    return finish(cv, 23, vig=0.45)


@scene('reino-kharveth', 2400, 1000)
def reino_kharveth(cv: Canvas):
    rng = np.random.default_rng(204)
    sky(cv, [(0.0, '#151c26'), (0.5, '#4d5a68'), (0.75, '#9aa3a8'), (1.0, '#5a6066')])
    clouds(cv, 51, '#c9ccc8', 0.0, 0.45, density=0.5, stretch=3, opacity=0.55)
    l1, m1 = ridge_layer(cv, 52, 0.42, 0.28, 2.6, '#6c7480', rim='#e6e9ea', ridged=True)
    snow(cv, l1, m1, 60 * cv.s, seed=53)
    haze(cv, '#9aa3a8', 0.35, 0.7, 0.3)
    l2, m2 = ridge_layer(cv, 54, 0.6, 0.22, 3.4, '#3e4650', rim='#cfd6da', ridged=True)
    snow(cv, l2, m2, 40 * cv.s, seed=55, threshold=0.6)
    fog(cv, 56, '#aab2b6', 0.66, 0.05, 0.6)
    # penhasco com fortaleza
    m = Mask(cv.h, cv.w)
    cx = 0.62 * cv.w
    m.poly([(0.48 * cv.w, cv.h), (0.53 * cv.w, 0.62 * cv.h), (0.58 * cv.w, 0.5 * cv.h), (0.67 * cv.w, 0.49 * cv.h), (0.72 * cv.w, 0.6 * cv.h), (0.78 * cv.w, cv.h)])
    wins = city(m, 0.57 * cv.w, 0.69 * cv.w, lambda x: 0.5 * cv.h, 26 * cv.s, rng, 'kharveth', density=1.2, lit=0.4, max_h=1.3)
    m.rect(cx - 12 * cv.s, 0.3 * cv.h, cx + 12 * cv.s, 0.5 * cv.h)
    m.poly([(cx - 18 * cv.s, 0.3 * cv.h), (cx, 0.24 * cv.h), (cx + 18 * cv.s, 0.3 * cv.h)])
    silhouette(cv, m, '#1c2128')
    lights(cv, wins, '#ffc875', 0.6, 2 * cv.s)
    m = Mask(cv.h, cv.w)
    forest(m, 0, 0.5 * cv.w, 0.97 * cv.h, 90 * cv.s, rng, density=1.0, kind='pine')
    forest(m, 0.76 * cv.w, cv.w, 0.97 * cv.h, 90 * cv.s, rng, density=1.0, kind='pine')
    silhouette(cv, m, '#11161b')
    return finish(cv, 24, vig=0.45)


@scene('reino-elyndor', 2400, 1000)
def reino_elyndor(cv: Canvas):
    rng = np.random.default_rng(205)
    sky(cv, [(0.0, '#8f9a8e'), (0.5, '#d9d6c2'), (1.0, '#c7c5ad')])
    sun_glow(cv, 0.7, 0.35, '#fff9e6', 0.35, 0.4)
    ridge_layer(cv, 61, 0.45, 0.08, 1.4, '#a5ab9c', texture=0.03)
    haze(cv, '#dcd9c5', 0.3, 0.55, 0.4)
    line, _ = ridge_layer(cv, 62, 0.52, 0.06, 2.2, '#7d8a6e', texture=0.05)
    m = Mask(cv.h, cv.w)
    wins = city(m, 0.55 * cv.w, 0.8 * cv.w, lambda x: float(line[min(int(x), cv.w - 1)]) + 3, 26 * cv.s, rng, 'elyndor', density=0.9, lit=0.2, max_h=1.2)
    bx, by = 0.68 * cv.w, float(line[int(0.68 * cv.w)])
    m.rect(bx - 70 * cv.s, by - 70 * cv.s, bx + 70 * cv.s, by + 4)
    m.ellipse(bx, by - 70 * cv.s, 60 * cv.s, 55 * cv.s)
    m.rect(bx - 6 * cv.s, by - 150 * cv.s, bx + 6 * cv.s, by - 120 * cv.s)
    for k in range(7):
        ax = bx - 60 * cv.s + k * 20 * cv.s
        m.rect(ax - 3 * cv.s, by - 60 * cv.s, ax + 3 * cv.s, by)
    silhouette(cv, m, '#6e7466')
    # terraços de jardins com ciprestes
    for k, (y, col) in enumerate([(0.58, '#6c7a5a'), (0.62, '#5d6c4c')]):
        m = Mask(cv.h, cv.w)
        m.rect(0, y * cv.h, 0.42 * cv.w - k * 60 * cv.s, cv.h * 0.64)
        forest(m, 0.02 * cv.w, 0.4 * cv.w - k * 60 * cv.s, y * cv.h, 60 * cv.s, rng, density=0.7, kind='cypress', jitter=0.02)
        silhouette(cv, m, col)
    water(cv, 0.64, '#8c9c94', reflect=True, ripple=0.003, darken=0.85)
    fog(cv, 63, '#e8e6d6', 0.6, 0.05, 0.55)
    m = Mask(cv.h, cv.w)
    forest(m, 0.8 * cv.w, cv.w, 0.98 * cv.h, 140 * cv.s, rng, density=0.6, kind='cypress', jitter=0.05)
    silhouette(cv, m, '#3b4436')
    return finish(cv, 25, vig=0.35, contrast=1.0)


@scene('reino-rhovaryn', 2400, 1000)
def reino_rhovaryn(cv: Canvas):
    rng = np.random.default_rng(206)
    sky(cv, [(0.0, '#41566a'), (0.5, '#9fb0b0'), (1.0, '#c8c3a2')])
    clouds(cv, 71, '#eceadf', 0.05, 0.5, density=0.55, stretch=3, opacity=0.7)
    clouds(cv, 72, '#7e8b93', 0.15, 0.45, density=0.35, stretch=3, opacity=0.4)
    ridge_layer(cv, 73, 0.5, 0.06, 1.3, '#7d8c84', texture=0.03)
    haze(cv, '#b8bfae', 0.4, 0.6, 0.35)
    line, _ = ridge_layer(cv, 74, 0.57, 0.04, 2.0, '#5f7246', texture=0.06)
    n = Noise(75)
    plain = smoothstep(0.56, 0.6, cv.Y)
    grass = mix(hex2rgb('#62743f') * np.ones_like(cv.img), hex2rgb('#8f9450'), n.fbm(cv.X * 5, cv.Y * 14, 5) * 0.5 + 0.5)
    cv.img = mix(cv.img, grass, plain * 0.9)
    depth = np.clip((cv.Y - 0.58) / 0.42, 0, 1)
    centre = 0.5 + 0.18 * np.sin(depth * 7 + 0.6) * (0.3 + depth)
    river = np.exp(-(((cv.u - centre) / (0.004 + depth * 0.06)) ** 2)) * plain
    cv.paint('#b9c6c4', river * 0.9)
    cv.light('#ffffff', river * 0.08)
    for k, (y, h_) in enumerate([(0.6, 30), (0.66, 45), (0.75, 70)]):
        m = Mask(cv.h, cv.w)
        x = rng.uniform(0, 0.2) * cv.w
        while x < cv.w:
            span = rng.uniform(0.08, 0.22) * cv.w
            forest(m, x, x + span, y * cv.h, h_ * cv.s, rng, density=1.2, kind='mixed', jitter=0.1)
            x += span + rng.uniform(0.1, 0.3) * cv.w
        silhouette(cv, m, ['#46573a', '#38492e', '#2a3822'][k])
    return finish(cv, 26, vig=0.4, contrast=1.0)


# ── 3.3 Origem do mundo ───────────────────────────────────────────────────


@scene('origem-chama', 2000, 1250)
def origem_chama(cv: Canvas):
    n = Noise(81)
    cv.img[:] = hex2rgb('#030305')
    neb = n.fbm(cv.X * 2 + n.fbm(cv.X * 3, cv.Y * 3, 4), cv.Y * 2, 6) * 0.5 + 0.5
    cv.paint('#2a0d1a', smoothstep(0.55, 0.9, neb) * 0.6)
    cv.paint('#3a1608', smoothstep(0.62, 0.95, neb) * glow(cv.h, cv.w, 0.5, 0.35, 0.7) * 0.7)
    stars(cv, 82, int(700 * cv.s * cv.s), ymax=1.0, brightness=0.5)
    # mundo nascente, iluminado de cima
    ax = cv.w / cv.h
    d = np.sqrt((cv.X - 0.5 * ax) ** 2 + (cv.Y - 1.95) ** 2)
    planet = smoothstep(1.205, 1.2, d)
    lit = np.clip((1.2 - (cv.Y - 0.75) * 3), 0, 1)
    surface = mix(hex2rgb('#1a120e') * np.ones_like(cv.img), hex2rgb('#6a4a2c'), (Noise(83).fbm(cv.X * 6, cv.Y * 6, 6) * 0.5 + 0.5) * lit)
    cv.img = mix(cv.img, surface, planet)
    rim = smoothstep(1.17, 1.2, d) * planet
    cv.light('#ffb45a', rim * 0.9)
    cv.light('#c24a1c', smoothstep(1.32, 1.2, d) * (1 - planet) * 0.35)
    light_rays(cv, 0.5, 0.32, '#f5a54a', count=26, spread=2.4, length=0.8, intensity=0.09, angle=math.pi / 2)
    sun_glow(cv, 0.5, 0.33, '#c4501e', 0.45, 0.7)
    flame(cv, 0.5, 0.52, 0.34, 0.07, seed=84, intensity=1.3)
    sun_glow(cv, 0.5, 0.36, '#fff0c8', 0.06, 0.8, 2)
    embers(cv, 85, 0.5, 0.4, 0.18, int(260 * cv.s))
    return finish(cv, 27, vig=0.55)


@scene('caos', 2000, 1250)
def caos(cv: Canvas):
    rng = np.random.default_rng(91)
    n1, n2 = Noise(92), Noise(93)
    wx = n1.fbm(cv.X * 1.5, cv.Y * 1.5, 5)
    wy = n2.fbm(cv.X * 1.5 + 4, cv.Y * 1.5, 5)
    f = n1.fbm(cv.X * 2.2 + wx * 2.5, cv.Y * 2.2 + wy * 2.5, 7) * 0.5 + 0.5
    cv.img = mix(hex2rgb('#04060b') * np.ones_like(cv.img), hex2rgb('#14223a'), smoothstep(0.35, 0.8, f))
    strands = np.abs(np.sin((f * 22) + wx * 6))
    cv.paint('#02030a', smoothstep(0.85, 1.0, strands) * 0.6)
    cv.light('#3b5f86', smoothstep(0.96, 1.0, np.abs(np.sin(f * 40 + wy * 8))) * 0.18)
    # espaços impossíveis: lajes flutuantes e escadas que não levam a lugar algum
    cv.light('#2a4a72', glow(cv.h, cv.w, 0.55, 0.45, 0.4, 1.4) * 0.45)
    for k in range(11):
        m = Mask(cv.h, cv.w)
        cx, cy = rng.uniform(0.12, 0.88) * cv.w, rng.uniform(0.15, 0.85) * cv.h
        size = rng.uniform(80, 240) * cv.s
        ang = rng.uniform(0, math.pi)
        steps = int(rng.integers(3, 8))
        for st in range(steps):
            ox = math.cos(ang) * st * size * 0.35
            oy = math.sin(ang) * st * size * 0.35 - st * size * 0.12
            w2, h2 = size * 0.5, size * 0.12
            ca, sa = math.cos(ang * 0.3), math.sin(ang * 0.3)
            pts = [(-w2, -h2), (w2, -h2), (w2, h2), (-w2, h2)]
            m.poly([(cx + ox + px * ca - py * sa, cy + oy + px * sa + py * ca) for px, py in pts])
        a = m.array()
        cv.paint('#03050a', a * 0.97)
        edge = np.clip(a - np.roll(a, (int(3 * cv.s), int(3 * cv.s)), axis=(0, 1)), 0, 1)
        cv.light('#8fb2d8', edge * 0.75)
        cv.paint('#000000', blur(np.roll(a, (int(18 * cv.s), int(10 * cv.s)), axis=(0, 1)), 12 * cv.s) * (1 - a) * 0.5)
    sun_glow(cv, 0.62, 0.44, '#1d3a5c', 0.35, 0.5)
    cv.paint('#000000', smoothstep(0.3, 0.0, f) * 0.5)
    return finish(cv, 28, vig=0.65, grain_amount=0.03)


# ── 3.4 Safra ─────────────────────────────────────────────────────────────


def safra_city(cv: Canvas, burning: bool):
    rng = np.random.default_rng(301)
    layers = [(0.6, 18, 0.6), (0.68, 26, 0.55), (0.78, 38, 0.5)]
    out = []
    for k, (base, scale, lit) in enumerate(layers):
        m = Mask(cv.h, cv.w)
        jitter = Noise(310 + k)
        base_px = base * cv.h
        wins = city(m, -20, cv.w + 20, lambda x, b=base_px: b + float(jitter(x * 0.003, k)) * 30 * cv.s, scale * cv.s, rng, 'ruins' if burning and k < 2 and rng.random() < 0.0 else 'safra', density=1.0, lit=lit, max_h=1.0 + k * 0.15)
        m.rect(-10, base_px + 10 * cv.s, cv.w + 10, cv.h)
        out.append((m, wins, base))
    return out


@scene('safra-antes', 2000, 1250)
def safra_antes(cv: Canvas):
    sky(cv, [(0.0, '#2b2340'), (0.35, '#a0593d'), (0.55, '#f0b36a'), (0.75, '#e08a4a'), (1.0, '#3a1c12')])
    clouds(cv, 101, '#f6c48c', 0.05, 0.4, density=0.45, stretch=4, opacity=0.6)
    sun_glow(cv, 0.4, 0.56, '#ffe0a0', 0.3, 0.6)
    ridge_layer(cv, 102, 0.55, 0.08, 1.6, '#7b4e3e', texture=0.04)
    haze(cv, '#e89a5a', 0.4, 0.6, 0.35)
    for k, (m, wins, base) in enumerate(safra_city(cv, False)):
        col = ['#8a4a33', '#5a2e21', '#2e1812'][k]
        silhouette(cv, m, col)
        lights(cv, wins, '#ffd18a', 0.6 + k * 0.1, 2 * cv.s)
        haze(cv, '#d07a44', base - 0.1, base + 0.03, 0.12 - k * 0.03)
    # terraço em primeiro plano, com braseiros, estandartes e pessoas
    m = Mask(cv.h, cv.w)
    m.rect(0, 0.9 * cv.h, cv.w, cv.h)
    rng = np.random.default_rng(303)
    for x in np.linspace(0.06, 0.94, 7):
        m.rect(x * cv.w - 2 * cv.s, 0.72 * cv.h, x * cv.w + 2 * cv.s, 0.9 * cv.h)
        m.poly([(x * cv.w + 2 * cv.s, 0.72 * cv.h), (x * cv.w + 40 * cv.s, 0.735 * cv.h), (x * cv.w + 36 * cv.s, 0.76 * cv.h), (x * cv.w + 2 * cv.s, 0.77 * cv.h)])
    for _ in range(int(26)):
        figure(m, rng.uniform(0.03, 0.97) * cv.w, 0.9 * cv.h, rng.uniform(36, 48) * cv.s)
    silhouette(cv, m, '#160b08')
    for x in (0.2, 0.5, 0.8):
        flame(cv, x, 0.895, 0.04, 0.007, seed=int(x * 70), intensity=0.9)
        cv.light('#ffa850', glow(cv.h, cv.w, x, 0.88, 0.08, 2) * 0.2)
    return finish(cv, 31, vig=0.45)


@scene('queda-safra', 2000, 1250)
def queda_safra(cv: Canvas):
    sky(cv, [(0.0, '#0a0607'), (0.35, '#2e0f0b'), (0.6, '#7a2210'), (0.78, '#b0401a'), (1.0, '#200a06')])
    for i, x in enumerate((0.22, 0.45, 0.68, 0.86)):
        smoke(cv, 111 + i, x, 0.66, 0.8, 0.22, '#140c0b', 0.75, lean=0.3)
    cv.light('#c2401a', glow(cv.h, cv.w, 0.55, 0.7, 0.6, 1.5) * 0.4)
    rng = np.random.default_rng(112)
    for k, (m, wins, base) in enumerate(safra_city(cv, True)):
        col = ['#3a1712', '#26100c', '#120807'][k]
        a = silhouette(cv, m, col)
        # janelas viram brasas
        lights(cv, wins[:: 2], '#ff7a2a', 0.5, 2 * cv.s)
        for _ in range(3 + k):
            fx = rng.uniform(0.08, 0.92)
            flame(cv, fx, base + 0.01, rng.uniform(0.12, 0.26), rng.uniform(0.03, 0.06), seed=int(fx * 1000) + k, intensity=0.95)
            cv.light('#ff6a22', glow(cv.h, cv.w, fx, base - 0.05, 0.12, 1.6) * 0.25)
    embers(cv, 113, 0.5, 0.66, 0.12, int(220 * cv.s))
    # colina em primeiro plano com silhuetas distantes que observam
    m = Mask(cv.h, cv.w)
    m.poly([(0, 0.86 * cv.h), (0.25 * cv.w, 0.84 * cv.h), (0.45 * cv.w, 0.87 * cv.h), (0.6 * cv.w, 0.9 * cv.h), (cv.w, 0.92 * cv.h), (cv.w, cv.h), (0, cv.h)])
    for x, h in [(0.12, 46), (0.15, 40), (0.2, 44), (0.29, 34), (0.33, 42)]:
        figure(m, x * cv.w, (0.845 + (x - 0.25) * -0.01) * cv.h, h * cv.s)
    silhouette(cv, m, '#0b0606')
    return finish(cv, 32, vig=0.55)


@scene('ruinas-safra', 2000, 1250)
def ruinas_safra(cv: Canvas):
    rng = np.random.default_rng(121)
    sky(cv, [(0.0, '#2c3442'), (0.5, '#8a8c92'), (0.7, '#c6a99a'), (1.0, '#5a5452')])
    clouds(cv, 122, '#d8d0c8', 0.05, 0.5, density=0.5, stretch=4, opacity=0.5)
    ridge_layer(cv, 123, 0.6, 0.07, 1.5, '#6c6a6e', texture=0.04)
    haze(cv, '#a9a2a0', 0.45, 0.65, 0.35)
    for k, (base, scale, col) in enumerate([(0.66, 20, '#57524f'), (0.74, 32, '#3e3936'), (0.86, 60, '#26211f')]):
        m = Mask(cv.h, cv.w)
        jitter = Noise(124 + k)
        city(m, -20, cv.w + 20, lambda x, b=base * cv.h: b + float(jitter(x * 0.003, 0)) * 20 * cv.s, scale * cv.s, rng, 'ruins', density=0.6 + k * 0.1, lit=0.0, max_h=0.9)
        m.rect(-10, base * cv.h + 6 * cv.s, cv.w + 10, cv.h)
        silhouette(cv, m, col)
        fog(cv, 130 + k, '#b9b2ae', base + 0.01, 0.03, 0.4)
    # grande arco partido em primeiro plano
    m = Mask(cv.h, cv.w)
    lx, rx, top = 0.6 * cv.w, 0.88 * cv.w, 0.42 * cv.h
    pw = 0.045 * cv.w
    m.rect(lx, top, lx + pw, cv.h)
    m.rect(rx, top + 0.12 * cv.h, rx + pw, cv.h)
    cx, r_out, r_in = (lx + rx + pw) / 2, (rx + pw - lx) / 2, (rx - lx - pw) / 2
    outer = [(cx - r_out * math.cos(t), top - r_out * math.sin(t) * 0.8) for t in np.linspace(0, 1.25, 30)]
    inner = [(cx - r_in * math.cos(t), top - r_in * math.sin(t) * 0.8) for t in np.linspace(1.15, 0, 30)]
    m.poly(outer + inner)
    ex, ey = outer[-1]
    ix_, iy_ = inner[0]
    m.poly([(ex, ey), (ex + 0.012 * cv.w, ey + 0.01 * cv.h), (ix_ + 0.004 * cv.w, iy_ - 0.004 * cv.h), (ix_, iy_)])
    m.poly([(rx - 0.01 * cv.w, top + 0.12 * cv.h), (rx + pw + 0.008 * cv.w, top + 0.1 * cv.h), (rx + pw, top + 0.14 * cv.h), (rx, top + 0.15 * cv.h)])
    for k in range(6):
        bx = rng.uniform(0.55, 0.95) * cv.w
        m.rect(bx, 0.94 * cv.h - rng.uniform(8, 20) * cv.s, bx + rng.uniform(20, 50) * cv.s, 0.95 * cv.h)
    silhouette(cv, m, '#1b1817')
    ash = Noise(131).fbm(cv.X * 40, cv.Y * 40, 3)
    cv.paint('#8c8682', smoothstep(0.9, 0.95, cv.Y) * smoothstep(0.2, 0.6, ash) * 0.3)
    return finish(cv, 33, vig=0.5, contrast=1.0)


# ── 3.6 Outros elementos ──────────────────────────────────────────────────


@scene('templo-chama', 2000, 1250)
def templo(cv: Canvas):
    sky(cv, [(0.0, '#0d1015'), (0.5, '#3a3f46'), (1.0, '#5c5a58')])
    light_rays(cv, 0.5, -0.1, '#d9d4c8', count=14, spread=0.8, length=1.4, intensity=0.1, angle=math.pi / 2)
    fog(cv, 141, '#6a6c70', 0.45, 0.2, 0.5, scale=2)
    m = Mask(cv.h, cv.w)
    cx = 0.5 * cv.w
    # escadaria
    for k in range(18):
        w2 = (0.45 - k * 0.012) * cv.w
        y = (0.98 - k * 0.022) * cv.h
        m.rect(cx - w2, y - 0.022 * cv.h, cx + w2, y)
    top = 0.98 - 18 * 0.022
    # fachada com colunata e frontão
    fw, fh = 0.26 * cv.w, 0.24 * cv.h
    base = top * cv.h
    m.rect(cx - fw, base - 0.03 * cv.h, cx + fw, base)
    for k in range(8):
        x = cx - fw * 0.9 + k * fw * 1.8 / 7
        m.rect(x - 0.012 * cv.w, base - fh, x + 0.012 * cv.w, base - 0.03 * cv.h)
    m.rect(cx - fw * 1.02, base - fh - 0.04 * cv.h, cx + fw * 1.02, base - fh)
    m.poly([(cx - fw * 1.06, base - fh - 0.04 * cv.h), (cx, base - fh - 0.15 * cv.h), (cx + fw * 1.06, base - fh - 0.04 * cv.h)])
    a = silhouette(cv, m, '#1a1b1e')
    door = Mask(cv.h, cv.w)
    door.rect(cx - 0.05 * cv.w, base - fh * 0.75, cx + 0.05 * cv.w, base - 0.03 * cv.h)
    cv.paint('#060607', door.array())
    # altar escuro: um braseiro apagado
    alt = Mask(cv.h, cv.w)
    alt.poly([(cx - 26 * cv.s, base - 0.03 * cv.h), (cx - 40 * cv.s, base - 0.075 * cv.h), (cx + 40 * cv.s, base - 0.075 * cv.h), (cx + 26 * cv.s, base - 0.03 * cv.h)])
    cv.paint('#0c0c0d', alt.array())
    cv.light('#7a3a1c', glow(cv.h, cv.w, 0.5, base / cv.h - 0.08, 0.04, 2) * 0.12)
    edge = np.clip(a - np.roll(a, (int(3 * cv.s), 0), axis=(0, 1)), 0, 1)
    cv.light('#a7a49c', edge * 0.35)
    fog(cv, 142, '#8a8a88', 0.92, 0.08, 0.7)
    fog(cv, 143, '#6a6c70', 0.6, 0.06, 0.35)
    return finish(cv, 34, vig=0.55)


@scene('ressonancia', 2000, 1250)
def ressonancia(cv: Canvas):
    ax = cv.w / cv.h
    sources = [(0.38, 0.5), (0.62, 0.5), (0.5, 0.3), (0.5, 0.72)]
    field = np.zeros_like(cv.X)
    for i, (sx, sy) in enumerate(sources):
        d = np.sqrt((cv.X - sx * ax) ** 2 + (cv.Y - sy) ** 2)
        field += np.sin(d * 90 - i * 0.8) / (1 + d * 3)
    field /= len(sources)
    bright = smoothstep(0.15, 0.6, field)
    cv.img[:] = hex2rgb('#07070a')
    cv.paint('#1a1210', glow(cv.h, cv.w, 0.5, 0.5, 0.7) * 0.8)
    cv.light('#c9a25e', bright * glow(cv.h, cv.w, 0.5, 0.5, 0.75, 1.5) * 0.75)
    cv.light('#9c2c1c', smoothstep(0.0, 0.3, -field) * glow(cv.h, cv.w, 0.5, 0.5, 0.6) * 0.18)
    for sx, sy in sources:
        cv.light('#fff0cc', glow(cv.h, cv.w, sx, sy, 0.012, 2) * 0.9)
    return finish(cv, 35, vig=0.6, grain_amount=0.018)


@scene('sonhos-kael', 2000, 1250)
def sonhos(cv: Canvas):
    rng = np.random.default_rng(161)
    sky(cv, [(0.0, '#0b0d26'), (0.5, '#2c2558'), (0.8, '#6b4a7a'), (1.0, '#2a1f3a')])
    stars(cv, 162, int(600 * cv.s * cv.s), ymax=0.9, brightness=0.7)
    cv.light('#f3e6c4', glow(cv.h, cv.w, 0.78, 0.2, 0.04, 2) * 1.0)
    cv.light('#8a78b8', glow(cv.h, cv.w, 0.78, 0.2, 0.25, 1.5) * 0.25)
    # ilhas suspensas (algumas invertidas)
    for k, (x, y, w, invert) in enumerate([(0.3, 0.32, 0.14, False), (0.55, 0.22, 0.08, True), (0.68, 0.48, 0.1, False), (0.18, 0.55, 0.06, True), (0.86, 0.38, 0.05, False)]):
        m = Mask(cv.h, cv.w)
        n = Noise(170 + k)
        xs = np.linspace(-1, 1, 40)
        top = [(x * cv.w + t * w * cv.w, y * cv.h - (1 - t * t) * 0.02 * cv.h + float(n(t * 3, 0)) * 6 * cv.s) for t in xs]
        bottom = [(x * cv.w + t * w * cv.w, y * cv.h + (1 - abs(t)) ** 1.5 * w * 1.2 * cv.h + float(n(t * 6, 2)) * 10 * cv.s) for t in xs[::-1]]
        pts = top + bottom
        if invert:
            pts = [(px, 2 * y * cv.h - py) for px, py in pts]
        m.poly(pts)
        forest(m, (x - w * 0.8) * cv.w, (x + w * 0.8) * cv.w, (y * cv.h if not invert else y * cv.h + 2), 26 * cv.s * (w / 0.1), rng, density=0.6, kind='pine')
        silhouette(cv, m, '#141230')
        cv.light('#b49ad8', np.clip(m.array() - np.roll(m.array(), int(3 * cv.s), axis=0), 0, 1) * 0.5)
    # escadaria que sobe ao céu
    m = Mask(cv.h, cv.w)
    for k in range(22):
        x = (0.42 + k * 0.012) * cv.w
        y = (0.86 - k * 0.028) * cv.h
        m.rect(x, y, x + 0.03 * cv.w, y + 0.008 * cv.h)
    silhouette(cv, m, '#1a1636')
    # penhasco e figura vista de costas
    m = Mask(cv.h, cv.w)
    m.poly([(0, 0.82 * cv.h), (0.2 * cv.w, 0.8 * cv.h), (0.33 * cv.w, 0.83 * cv.h), (0.36 * cv.w, cv.h), (0, cv.h)])
    figure(m, 0.27 * cv.w, 0.81 * cv.h, 42 * cv.s)
    silhouette(cv, m, '#07060f')
    fog(cv, 163, '#5a4a86', 0.9, 0.06, 0.4)
    return finish(cv, 36, vig=0.55)


@scene('seculo-perdido', 2000, 1250)
def seculo(cv: Canvas):
    rng = np.random.default_rng(171)
    sky(cv, [(0.0, '#4a4740'), (0.55, '#a39b8a'), (1.0, '#6e675c')])
    fog(cv, 172, '#b9b1a0', 0.6, 0.15, 0.6, scale=2)
    for k in range(14):
        depth = k / 13
        x = rng.uniform(0.05, 0.95) * cv.w
        base = (0.62 + depth * 0.3) * cv.h
        h = (40 + depth * 260) * cv.s
        w = h * rng.uniform(0.18, 0.3)
        m = Mask(cv.h, cv.w)
        tilt = rng.uniform(-0.15, 0.15)
        m.poly([(x - w / 2, base), (x - w / 2 + tilt * h, base - h * rng.uniform(0.7, 1.0)), (x + w / 2 + tilt * h, base - h), (x + w / 2, base)])
        silhouette(cv, m, mix(hex2rgb('#8f8778'), hex2rgb('#2c2924'), depth))
    m = Mask(cv.h, cv.w)
    m.rect(0, 0.92 * cv.h, cv.w, cv.h)
    silhouette(cv, m, '#3a352e')
    # páginas em branco atravessando o ar
    for _ in range(18):
        m = Mask(cv.h, cv.w)
        x, y = rng.uniform(0.05, 0.95) * cv.w, rng.uniform(0.1, 0.7) * cv.h
        size = rng.uniform(14, 40) * cv.s
        ang = rng.uniform(0, math.pi)
        c, s_ = math.cos(ang), math.sin(ang)
        pts = [(-1, -0.7), (1, -0.6), (0.9, 0.75), (-1.05, 0.7)]
        m.poly([(x + (px * c - py * s_) * size, y + (px * s_ + py * c) * size) for px, py in pts])
        cv.paint('#ece6d8', m.array() * 0.9)
    fog(cv, 173, '#c7bfae', 0.85, 0.08, 0.5)
    return finish(cv, 37, vig=0.5, contrast=1.0)


@scene('manuscritos-antigos', 2000, 1250)
def manuscritos(cv: Canvas):
    rng = np.random.default_rng(181)
    leather = Noise(182).fbm(cv.X * 6, cv.Y * 6, 6) * 0.5 + 0.5
    cv.img = mix(hex2rgb('#1c120c') * np.ones_like(cv.img), hex2rgb('#3a2416'), leather)
    cv.img = multiply(cv.img, 1 + Noise(183).fbm(cv.X * 80, cv.Y * 80, 2) * 0.08)
    sheets = [(0.3, 0.42, 0.22, 0.3, -0.12), (0.62, 0.48, 0.24, 0.32, 0.08), (0.45, 0.66, 0.2, 0.22, 0.2), (0.78, 0.3, 0.14, 0.18, -0.25)]
    for i, (sx, sy, sw, sh, ang) in enumerate(sheets):
        c, s_ = math.cos(ang), math.sin(ang)
        cx, cy = sx * cv.w, sy * cv.h
        hw, hh = sw * cv.w / 2, sh * cv.h / 2
        corners = [(-hw, -hh), (hw, -hh * 0.96), (hw * 1.01, hh), (-hw * 0.98, hh * 1.02)]
        pts = [(cx + px * c - py * s_, cy + px * s_ + py * c) for px, py in corners]
        sh_m = Mask(cv.h, cv.w)
        sh_m.poly([(px + 12 * cv.s, py + 16 * cv.s) for px, py in pts])
        cv.paint('#000000', blur(sh_m.array(), 10 * cv.s) * 0.6)
        m = Mask(cv.h, cv.w)
        m.poly(pts)
        a = m.array()
        paper = mix(hex2rgb('#d9c49a') * np.ones_like(cv.img), hex2rgb('#a8875a'), Noise(190 + i).fbm(cv.X * 5, cv.Y * 5, 6) * 0.5 + 0.5)
        edge = smoothstep(0.4, 1.0, blur(1 - a, 14 * cv.s) * 2) * a
        paper = multiply(paper, 1 - edge * 0.6)
        cv.img = mix(cv.img, paper, a)
        # escrita ilegível (traços, não letras)
        ink = Mask(cv.h, cv.w)
        lines = int(sh * 46)
        for l in range(lines):
            ly = -hh * 0.8 + l * (hh * 1.6) / lines
            x = -hw * 0.82
            while x < hw * 0.8:
                seg = rng.uniform(10, 46) * cv.s
                pts2 = []
                for t in np.linspace(0, 1, 6):
                    px = x + t * seg
                    py = ly + math.sin(t * 9 + rng.uniform(0, 3)) * 1.4 * cv.s
                    pts2.append((cx + px * c - py * s_, cy + px * s_ + py * c))
                ink.line(pts2, 1.4 * cv.s)
                x += seg + rng.uniform(5, 12) * cv.s
        cv.paint('#3a2414', ink.array() * a * 0.75)
    # selo de cera
    sx, sy = 0.56 * cv.w, 0.62 * cv.h
    m = Mask(cv.h, cv.w)
    m.ellipse(sx, sy, 46 * cv.s, 44 * cv.s)
    a = m.array()
    cv.paint('#7a1a12', a)
    cv.light('#c8502e', np.clip(a - np.roll(a, (int(3 * cv.s), int(3 * cv.s)), axis=(0, 1)), 0, 1) * 0.6)
    m = Mask(cv.h, cv.w)
    m.ellipse(sx, sy, 26 * cv.s, 25 * cv.s)
    cv.paint('#5a120c', m.array() * 0.6)
    # pena
    m = Mask(cv.h, cv.w)
    quill = [(0.12 * cv.w, 0.86 * cv.h), (0.18 * cv.w, 0.72 * cv.h), (0.26 * cv.w, 0.6 * cv.h), (0.32 * cv.w, 0.55 * cv.h), (0.27 * cv.w, 0.63 * cv.h), (0.2 * cv.w, 0.76 * cv.h)]
    m.poly(quill)
    cv.paint('#e8e0cc', m.array() * 0.92)
    m = Mask(cv.h, cv.w)
    m.line([(0.11 * cv.w, 0.88 * cv.h), (0.31 * cv.w, 0.56 * cv.h)], 2.5 * cv.s)
    cv.paint('#5a4632', m.array())
    sun_glow(cv, 0.4, 0.3, '#ffcf8a', 0.6, 0.12)
    return finish(cv, 38, vig=0.6)


@scene('skrugheim', 2000, 1250)
def skrugheim(cv: Canvas):
    cv.img[:] = hex2rgb('#040506')
    fog(cv, 191, '#10141a', 0.5, 0.4, 0.8, scale=2)
    cx = 0.5 * cv.w
    m = Mask(cv.h, cv.w)
    # moldura monolítica e portas colossais
    m.rect(cx - 0.24 * cv.w, 0.08 * cv.h, cx + 0.24 * cv.w, 0.92 * cv.h)
    a = silhouette(cv, m, '#0e1013')
    door = Mask(cv.h, cv.w)
    door.rect(cx - 0.17 * cv.w, 0.18 * cv.h, cx - 0.004 * cv.w, 0.92 * cv.h)
    door.rect(cx + 0.004 * cv.w, 0.18 * cv.h, cx + 0.17 * cv.w, 0.92 * cv.h)
    d = door.array()
    panel = Noise(192).fbm(cv.X * 20, cv.Y * 4, 4) * 0.5 + 0.5
    cv.paint('#16191e', d)
    cv.paint('#1d2127', d * smoothstep(0.55, 0.8, panel) * 0.6)
    for k in range(5):
        y = (0.26 + k * 0.14) * cv.h
        b = Mask(cv.h, cv.w)
        b.rect(cx - 0.17 * cv.w, y, cx + 0.17 * cv.w, y + 0.008 * cv.h)
        cv.paint('#0a0b0d', b.array() * 0.8)
    # luz fria pela fresta
    ax = cv.w / cv.h
    slit = np.exp(-(((cv.X - 0.5 * ax) / 0.0025) ** 2)) * smoothstep(0.16, 0.2, cv.Y) * smoothstep(0.93, 0.9, cv.Y)
    cv.light('#d6e6f2', slit * 1.2)
    cv.light('#6f92ad', np.exp(-(((cv.X - 0.5 * ax) / 0.03) ** 2)) * smoothstep(0.12, 0.3, cv.Y) * 0.25)
    light_rays(cv, 0.5, 0.55, '#9ab6cc', count=12, spread=1.6, length=0.7, intensity=0.05, angle=math.pi / 2)
    fog(cv, 193, '#3a4a58', 0.93, 0.06, 0.6)
    cv.light('#8fb0c8', glow(cv.h, cv.w, 0.5, 0.95, 0.25, 1.5) * 0.15)
    return finish(cv, 39, vig=0.65)


@scene('brumafunda', 2000, 1250)
def brumafunda(cv: Canvas):
    rng = np.random.default_rng(201)
    sky(cv, [(0.0, '#59636e'), (0.55, '#c8bca0'), (1.0, '#8f9187')])
    sun_glow(cv, 0.35, 0.45, '#fff0cc', 0.3, 0.4)
    ridge_layer(cv, 202, 0.5, 0.08, 1.4, '#7f877f', texture=0.03)
    haze(cv, '#c6c2b0', 0.35, 0.6, 0.45)
    line, _ = ridge_layer(cv, 203, 0.64, 0.06, 2.0, '#5b6650', texture=0.05)
    m = Mask(cv.h, cv.w)
    wins = city(m, 0.22 * cv.w, 0.72 * cv.w, lambda x: float(line[min(int(x), cv.w - 1)]) + 6 * cv.s, 60 * cv.s, rng, 'brumafunda', density=0.6, lit=0.6)
    silhouette(cv, m, '#3c4136')
    lights(cv, wins, '#ffcb7a', 0.7, 2 * cv.s)
    for k in range(4):
        smoke(cv, 210 + k, rng.uniform(0.3, 0.68), 0.58, 0.16, 0.03, '#a9a69a', 0.22, lean=0.08)
    fog(cv, 204, '#d9d5c6', 0.66, 0.05, 0.8)
    m = Mask(cv.h, cv.w)
    forest(m, 0, cv.w, 0.95 * cv.h, 110 * cv.s, rng, density=0.5, kind='mixed')
    silhouette(cv, m, '#2a3029')
    fog(cv, 205, '#e2ded0', 0.9, 0.06, 0.5)
    return finish(cv, 40, vig=0.45, contrast=1.0)


@scene('terras-incognitas', 2000, 1250)
def terras(cv: Canvas):
    sky(cv, [(0.0, '#3e4650'), (0.6, '#a7aaa0'), (1.0, '#7a7d72')])
    clouds(cv, 221, '#d6d6cc', 0.15, 0.6, density=0.6, stretch=4, opacity=0.8)
    for k, (base, amp, col) in enumerate([(0.52, 0.1, '#7d8379'), (0.62, 0.12, '#5d6658'), (0.74, 0.1, '#46503f'), (0.88, 0.08, '#30382b')]):
        ridge_layer(cv, 222 + k, base, amp, 1.4 + k * 0.6, col, rim='#e6e2d0' if k < 2 else None, texture=0.06)
        fog(cv, 230 + k, '#c4c4b8', base + 0.02, 0.03, 0.5 - k * 0.08)
    return finish(cv, 41, vig=0.45, contrast=1.0)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    preview = '--preview' in sys.argv
    scale = 0.4 if preview else 1.0
    OUT.mkdir(parents=True, exist_ok=True)
    names = args or list(SCENES)
    for name in names:
        fn, w, h = SCENES[name]
        cv = Canvas(w, h, scale)
        img = fn(cv)
        target = (OUT / f'{name}.webp') if not preview else Path(sys.argv[0]).parent / '.preview' / f'{name}.webp'
        target.parent.mkdir(parents=True, exist_ok=True)
        save_webp(img, target, quality=80)
        print(target)
