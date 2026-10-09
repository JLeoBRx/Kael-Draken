"""
Biblioteca procedural das artes do Atlas de Kael Draken.

Tudo é gerado a partir de ruído, geometria e composição — não há modelos de
geração de imagens envolvidos. As funções trabalham com arrays numpy float32
(altura, largura[, 3]) com valores em [0, 1].
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

F = np.float32


# ── Ruído ──────────────────────────────────────────────────────────────────


def _fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


class Noise:
    """Ruído de gradiente 2D (Perlin) vetorizado, com fbm e variante ridged."""

    def __init__(self, seed: int):
        rng = np.random.default_rng(seed)
        perm = rng.permutation(256)
        self.perm = np.concatenate([perm, perm]).astype(np.int64)
        ang = rng.random(256) * 2 * np.pi
        self.gx = np.cos(ang).astype(F)
        self.gy = np.sin(ang).astype(F)

    def __call__(self, x, y):
        x = np.asarray(x, dtype=F)
        y = np.asarray(y, dtype=F)
        xi = np.floor(x).astype(np.int64)
        yi = np.floor(y).astype(np.int64)
        xf = (x - xi).astype(F)
        yf = (y - yi).astype(F)
        xi &= 255
        yi &= 255
        p = self.perm
        x1 = (xi + 1) & 255
        y1 = (yi + 1) & 255

        def g(ix, iy, dx, dy):
            h = p[p[ix] + iy] & 255
            return self.gx[h] * dx + self.gy[h] * dy

        n00 = g(xi, yi, xf, yf)
        n10 = g(x1, yi, xf - 1, yf)
        n01 = g(xi, y1, xf, yf - 1)
        n11 = g(x1, y1, xf - 1, yf - 1)
        u = _fade(xf)
        v = _fade(yf)
        a = n00 + u * (n10 - n00)
        b = n01 + u * (n11 - n01)
        return ((a + v * (b - a)) * 1.414).astype(F)

    def fbm(self, x, y, octaves=6, lacunarity=2.0, gain=0.5):
        total = np.zeros(np.broadcast(np.asarray(x), np.asarray(y)).shape, dtype=F)
        amp, freq, norm = 1.0, 1.0, 0.0
        for o in range(octaves):
            total += amp * self(x * freq + o * 17.3, y * freq + o * 9.1)
            norm += amp
            amp *= gain
            freq *= lacunarity
        return total / norm

    def ridged(self, x, y, octaves=6, lacunarity=2.0, gain=0.5):
        total = np.zeros(np.broadcast(np.asarray(x), np.asarray(y)).shape, dtype=F)
        amp, freq, norm, prev = 1.0, 1.0, 0.0, 1.0
        for o in range(octaves):
            n = 1 - np.abs(self(x * freq + o * 31.7, y * freq - o * 11.3))
            n = n * n * prev
            prev = np.clip(n * 1.6, 0, 1)
            total += amp * n
            norm += amp
            amp *= gain
            freq *= lacunarity
        return total / norm


def grid(h: int, w: int, aspect: bool = True):
    """Coordenadas normalizadas: y em [0,1] e x em [0, w/h] (isotrópico)."""
    ys = np.linspace(0, 1, h, dtype=F)
    xs = np.linspace(0, (w / h) if aspect else 1, w, dtype=F)
    return np.meshgrid(xs, ys)


# ── Cores e composição ─────────────────────────────────────────────────────


def hex2rgb(value: str):
    value = value.lstrip('#')
    return np.array([int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=F)


def mix(a, b, t):
    t = np.asarray(t, dtype=F)
    if t.ndim == 2:
        t = t[..., None]
    return (a * (1 - t) + b * t).astype(F)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return (t * t * (3 - 2 * t)).astype(F)


def ramp(values, stops: Sequence[tuple[float, str]]):
    """Mapeia valores escalares para uma rampa de cores [(posição, '#hex'), ...]."""
    pos = np.array([s[0] for s in stops], dtype=F)
    cols = np.stack([hex2rgb(s[1]) for s in stops])
    out = np.empty(values.shape + (3,), dtype=F)
    for c in range(3):
        out[..., c] = np.interp(values, pos, cols[:, c])
    return out


def vgradient(h, w, stops):
    v = np.linspace(0, 1, h, dtype=F)[:, None] * np.ones((1, w), dtype=F)
    return ramp(v, stops)


def fill(h, w, color):
    return np.broadcast_to(hex2rgb(color) if isinstance(color, str) else color, (h, w, 3)).astype(F).copy()


def over(base, layer, alpha):
    """Composição normal: layer sobre base com alpha (2D)."""
    a = np.clip(alpha, 0, 1).astype(F)[..., None]
    return (base * (1 - a) + layer * a).astype(F)


def screen(base, layer, amount=1.0):
    return (1 - (1 - base) * (1 - np.clip(layer * amount, 0, 1))).astype(F)


def add_light(base, color, intensity):
    c = hex2rgb(color) if isinstance(color, str) else color
    return np.clip(base + c * intensity[..., None], 0, 1).astype(F)


def multiply(base, factor):
    f = np.asarray(factor, dtype=F)
    if f.ndim == 2:
        f = f[..., None]
    return np.clip(base * f, 0, 1).astype(F)


def radial(h, w, cx, cy, r, aspect=True):
    """Distância normalizada ao centro (cx, cy em frações de largura/altura)."""
    ys = np.linspace(0, 1, h, dtype=F)[:, None]
    xs = np.linspace(0, 1, w, dtype=F)[None, :]
    ax = (w / h) if aspect else 1
    d = np.sqrt(((xs - cx) * ax) ** 2 + (ys - cy) ** 2)
    return (d / r).astype(F)


def glow(h, w, cx, cy, r, power=2.0):
    d = radial(h, w, cx, cy, r)
    return np.exp(-(d**power)).astype(F)


def box_blur(arr, radius: int):
    if radius < 1:
        return arr
    out = arr.astype(F)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (radius + 1, radius)
        p = np.pad(out, pad, mode='edge')
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * radius + 1, 2 * radius + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = ((hi - lo) / (2 * radius + 1)).astype(F)
    return out


def blur(arr, radius: float):
    """Aproximação de desfoque gaussiano com três passadas de caixa."""
    r = max(1, int(round(radius / 1.7)))
    out = arr
    for _ in range(3):
        out = box_blur(out, r)
    return out


def grain(img, amount=0.035, seed=1):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amount, img.shape[:2]).astype(F)
    return np.clip(img + n[..., None], 0, 1).astype(F)


def vignette(img, strength=0.55, softness=0.9):
    h, w = img.shape[:2]
    d = radial(h, w, 0.5, 0.5, 0.5 * w / h * 1.05)
    v = 1 - strength * smoothstep(softness * 0.45, 1.25, d)
    return multiply(img, v)


def tone(img, contrast=1.0, lift=0.0, gamma=1.0):
    out = np.clip((img - 0.5) * contrast + 0.5 + lift, 0, 1)
    return np.power(out, gamma).astype(F)


# ── Silhuetas vetoriais (com superamostragem para bordas suaves) ───────────


class Mask:
    """Desenha polígonos/elipses em uma máscara 'L' superamostrada."""

    def __init__(self, h: int, w: int, ss: int = 3):
        self.h, self.w, self.ss = h, w, ss
        self.img = Image.new('L', (w * ss, h * ss), 0)
        self.draw = ImageDraw.Draw(self.img)

    def _p(self, pts):
        s = self.ss
        return [(float(x) * s, float(y) * s) for x, y in pts]

    def poly(self, pts, value=255):
        if len(pts) >= 3:
            self.draw.polygon(self._p(pts), fill=value)
        return self

    def rect(self, x0, y0, x1, y1, value=255):
        s = self.ss
        self.draw.rectangle([x0 * s, y0 * s, x1 * s, y1 * s], fill=value)
        return self

    def ellipse(self, cx, cy, rx, ry, value=255):
        s = self.ss
        self.draw.ellipse([(cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s], fill=value)
        return self

    def line(self, pts, width, value=255):
        s = self.ss
        self.draw.line(self._p(pts), fill=value, width=max(1, int(width * s)), joint='curve')
        return self

    def array(self) -> np.ndarray:
        small = self.img.resize((self.w, self.h), Image.LANCZOS)
        return (np.asarray(small, dtype=F) / 255).astype(F)


def catmull(points: Sequence[tuple[float, float]], samples=24):
    """Curva Catmull-Rom suave que passa pelos pontos."""
    pts = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(pts[j], dtype=float) for j in (i - 1, i, i + 1, i + 2))
        for t in np.linspace(0, 1, samples, endpoint=False):
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((float(q[0]), float(q[1])))
    out.append(tuple(map(float, points[-1])))
    return out


def tapered_stroke(path, widths):
    """Polígono de um traço com largura variável ao longo de um caminho."""
    path = np.array(path, dtype=float)
    n = len(path)
    widths = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(widths)), widths)
    tang = np.gradient(path, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9
    normal = np.stack([-tang[:, 1], tang[:, 0]], axis=1)
    left = path + normal * (widths[:, None] / 2)
    right = path - normal * (widths[:, None] / 2)
    return [tuple(p) for p in left] + [tuple(p) for p in right[::-1]]


def ridge_line(noise: Noise, w: int, base: float, amp: float, freq: float, octaves=6, offset=0.0, ridged=False):
    """Linha de cume (y em pixels por coluna) a partir de ruído 1D."""
    xs = np.linspace(0, freq, w, dtype=F)
    ys = np.full(w, offset, dtype=F)
    n = noise.ridged(xs, ys, octaves) if ridged else noise.fbm(xs, ys, octaves)
    return (base - amp * n).astype(F)


def fill_below(h, w, line):
    """Máscara (com borda suave) da área abaixo de uma linha y(x)."""
    ys = np.arange(h, dtype=F)[:, None]
    return np.clip(ys - line[None, :] + 0.5, 0, 1).astype(F)


def save_webp(img, path, quality=82):
    arr = (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(arr, 'RGB').save(path, 'WEBP', quality=quality, method=6)


def to_pil(img):
    return Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
