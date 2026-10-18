"""
Logotipo do Livro I recortado da capa oficial.

  python3 scripts/art/logotype.py

Fonte: public/capa/capa-oficial.webp (a capa aprovada). As letras metálicas do
título estão sobre o céu escuro da arte: a transparência vem do brilho (letras
claras) e da saturação (o céu alaranjado do horizonte fica de fora). Nada é
redesenhado — é o mesmo logotipo da capa, para ser usado sobre fundos escuros.

Produz public/images/marca/logotipo-kael-draken.webp (com transparência).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from artlib import smoothstep

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SRC = ROOT / 'public' / 'capa' / 'capa-oficial.webp'
OUT = ROOT / 'public' / 'images' / 'marca' / 'logotipo-kael-draken.webp'

# Área do logotipo na capa (907 × 1333): título, "Livro I" e subtítulo
BOX = (95, 60, 820, 545)
# Nuvem iluminada no canto inferior esquerdo, ao lado do subtítulo, e o céu
# abaixo da linha de base do subtítulo (coordenadas dentro de BOX)
CLOUD = (0, 395, 55, 485)
BASELINE = 468


def main():
    cover = Image.open(SRC).convert('RGB')
    assert cover.size == (907, 1333), f'capa com tamanho inesperado: {cover.size}'
    rgb = np.asarray(cover.crop(BOX), dtype=np.float32) / 255
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hi = rgb.max(-1)
    sat = (hi - rgb.min(-1)) / np.maximum(hi, 1e-6)
    alpha = smoothstep(0.30, 0.55, lum) * (1 - 0.85 * smoothstep(0.45, 0.75, sat))
    x0, y0, x1, y1 = CLOUD
    alpha[y0:y1, x0:x1] = 0
    alpha[BASELINE:] = 0
    alpha[alpha < 0.05] = 0

    ys, xs = np.nonzero(alpha > 0.02)
    pad = 6
    top, bottom = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + pad + 1)
    left, right = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + pad + 1)
    rgba = np.dstack([rgb, alpha])[top:bottom, left:right]
    img = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, 'WEBP', quality=92, alpha_quality=100, method=6)
    print(f'{OUT.relative_to(ROOT)}: {img.width}×{img.height}')


if __name__ == '__main__':
    main()
