"""
Brasões conceituais dos seis reinos (SVG) e a página do painel heráldico.

São PROPOSTAS heráldicas: nenhum brasão foi aprovado pelo autor, e os
símbolos não têm significado mágico definido. As cargas seguem apenas a
ligação de Safra com as chamas (estabelecida) e as direções visuais
propostas para os demais reinos.

Saída:
  public/images/atlas/brasoes/<reino>.svg
  scripts/art/.build/painel.html  (rasterizado por scripts/art/panel.mjs)
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from artlib import Noise, grid, hex2rgb, mix, multiply, smoothstep, to_pil  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'images' / 'atlas' / 'brasoes'
BUILD = Path(__file__).parent / '.build'

GOLD = '#cdb27f'
GOLD_DARK = '#8d7240'
INK = '#120d09'

SHIELD = 'M120 12 L222 36 V128 C222 198 176 246 120 270 C64 246 18 198 18 128 V36 Z'
SHIELD_INNER = 'M120 26 L208 47 V129 C208 189 169 232 120 254 C71 232 32 189 32 129 V47 Z'

CHARGES = {
    # Safra — ligação excepcional com as chamas (estabelecida)
    'safra': (
        '#5c170f',
        f'''<circle cx="120" cy="170" r="44" fill="none" stroke="{GOLD}" stroke-width="9"/>
<circle cx="120" cy="170" r="44" fill="none" stroke="{INK}" stroke-width="1.5" opacity=".6"/>
<path d="M120 58 C134 88 160 104 152 140 C148 160 134 172 120 176 C106 172 92 160 88 140 C84 118 98 104 104 88 C108 102 114 108 118 112 C114 92 116 74 120 58 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M120 112 C128 126 138 134 134 150 C131 162 126 166 120 168 C114 166 109 162 106 150 C104 140 110 132 114 124 C116 132 118 134 120 136 Z" fill="#5c170f"/>''',
    ),
    # Aurelion — direção proposta: arquitetura monumental e vales férteis
    'aurelion': (
        '#3b2f17',
        f'''<path d="M64 106 L120 72 L176 106 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<rect x="66" y="106" width="108" height="10" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>
<g fill="{GOLD}" stroke="{INK}" stroke-width="2">
<rect x="74" y="118" width="11" height="52"/><rect x="98" y="118" width="11" height="52"/><rect x="131" y="118" width="11" height="52"/><rect x="155" y="118" width="11" height="52"/>
</g>
<rect x="62" y="170" width="116" height="10" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>
<path d="M58 206 C80 196 100 216 120 206 C140 196 160 216 182 206" fill="none" stroke="{GOLD}" stroke-width="6"/>
<path d="M70 226 C88 218 104 234 120 226 C136 218 152 234 170 226" fill="none" stroke="{GOLD}" stroke-width="5"/>''',
    ),
    # Nácaris — direção proposta: cidades costeiras e navegação
    'nacaris': (
        '#18303f',
        f'''<path d="M120 52 L126 70 L144 76 L126 82 L120 100 L114 82 L96 76 L114 70 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>
<path d="M116 104 V174" stroke="{GOLD}" stroke-width="6"/>
<path d="M120 108 L162 164 L120 164 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M112 116 L84 160 L112 160 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M70 176 L170 176 L156 196 L84 196 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M52 214 C70 204 86 224 104 214 C122 204 138 224 156 214 C170 206 180 214 188 214" fill="none" stroke="{GOLD}" stroke-width="6"/>''',
    ),
    # Kharveth — direção proposta: montanhas e fortalezas; pacto entre cinco ordens
    'kharveth': (
        '#2a2b2f',
        f'''<g fill="{GOLD}" stroke="{INK}" stroke-width="2">
<circle cx="76" cy="74" r="7"/><circle cx="98" cy="62" r="7"/><circle cx="120" cy="58" r="7"/><circle cx="142" cy="62" r="7"/><circle cx="164" cy="74" r="7"/>
</g>
<path d="M44 200 L96 104 L120 136 L146 96 L196 200 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M96 104 L108 128 L100 124 L92 136 Z M146 96 L160 124 L150 120 L142 132 Z" fill="#f1e6cc"/>
<path d="M84 200 V160 H94 V150 H104 V160 H114 V150 H126 V160 H136 V150 H146 V160 H156 V200 Z" fill="#2a2b2f" stroke="{GOLD}" stroke-width="4"/>
<path d="M110 200 V180 A10 10 0 0 1 130 180 V200 Z" fill="{GOLD}"/>''',
    ),
    # Elyndor — direção proposta: espaços contemplativos, jardins e bibliotecas
    'elyndor': (
        '#24301f',
        f'''<path d="M120 60 C128 74 134 82 132 94 C130 104 125 108 120 110 C115 108 110 104 108 94 C106 82 112 74 120 60 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>
<path d="M112 112 H128 L124 124 H116 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>
<path d="M120 196 C100 180 76 178 56 184 V136 C76 130 100 132 120 148 C140 132 164 130 184 136 V184 C164 178 140 180 120 196 Z" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M120 148 V196" stroke="{INK}" stroke-width="2.5"/>
<g stroke="{INK}" stroke-width="1.6" opacity=".7"><path d="M68 150 C84 146 100 148 112 156"/><path d="M68 162 C84 158 100 160 112 168"/><path d="M128 156 C140 148 156 146 172 150"/><path d="M128 168 C140 160 156 158 172 162"/></g>
<path d="M78 222 C96 206 108 214 120 206 C132 214 144 206 162 222" fill="none" stroke="{GOLD}" stroke-width="5"/>''',
    ),
    # Rhovaryn — direção proposta: planícies, florestas e rios; liga de territórios
    'rhovaryn': (
        '#26351b',
        f'''<path d="M114 182 V142 M126 182 V142" stroke="{GOLD}" stroke-width="7"/>
<circle cx="120" cy="104" r="42" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<circle cx="92" cy="124" r="22" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<circle cx="148" cy="124" r="22" fill="{GOLD}" stroke="{INK}" stroke-width="2.5"/>
<path d="M120 182 C108 188 98 188 90 184 M120 182 C132 188 142 188 150 184" stroke="{GOLD}" stroke-width="5" fill="none"/>
<path d="M44 206 C70 194 92 222 120 208 C148 194 170 222 196 206" fill="none" stroke="#9fb3b0" stroke-width="9"/>
<path d="M44 206 C70 194 92 222 120 208 C148 194 170 222 196 206" fill="none" stroke="{INK}" stroke-width="1.5" opacity=".6"/>''',
    ),
}

NAMES = {'safra': 'Safra', 'aurelion': 'Aurelion', 'nacaris': 'Nácaris', 'kharveth': 'Kharveth', 'elyndor': 'Elyndor', 'rhovaryn': 'Rhovaryn'}


def emblem_svg(key: str, standalone=True) -> str:
    field, charge = CHARGES[key]
    head = '<?xml version="1.0" encoding="UTF-8"?>\n' if standalone else ''
    return f'''{head}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280" role="img" aria-label="Brasão conceitual de {NAMES[key]} (proposta)">
<title>Brasão conceitual de {NAMES[key]} — proposta heráldica</title>
<defs><linearGradient id="g-{key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".10"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".25"/></linearGradient></defs>
<path d="{SHIELD}" fill="{field}" stroke="{GOLD_DARK}" stroke-width="5"/>
<path d="{SHIELD_INNER}" fill="none" stroke="{GOLD}" stroke-width="1.6" opacity=".7"/>
{charge}
<path d="{SHIELD}" fill="url(#g-{key})"/>
</svg>
'''


def leather_texture(path: Path, w=1200, h=800):
    X, Y = grid(h, w)
    n = Noise(401)
    base = mix(hex2rgb('#1a120d') * np.ones((h, w, 3), dtype=np.float32), hex2rgb('#2e1e14'), n.fbm(X * 4, Y * 4, 6) * 0.5 + 0.5)
    pores = Noise(402).fbm(X * 120, Y * 120, 2)
    base = multiply(base, 1 + pores * 0.12)
    crack = smoothstep(0.92, 1.0, 1 - np.abs(Noise(403).fbm(X * 9, Y * 9, 4)))
    base = multiply(base, 1 - crack * 0.25)
    to_pil(base).save(path)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    for key in CHARGES:
        (OUT / f'{key}.svg').write_text(emblem_svg(key))
    leather_texture(BUILD / 'couro.png')
    cells = '\n'.join(f'<div class="cell">{emblem_svg(k, standalone=False)}</div>' for k in ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn'])
    html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:2400px;height:1600px;background:#1a120d url(couro.png) center/cover;}}
.grid{{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);width:2400px;height:1600px;box-sizing:border-box;padding:110px 160px;gap:60px 120px;}}
.cell{{display:grid;place-items:center;border:2px solid rgba(205,178,127,.28);box-shadow:inset 0 0 0 10px rgba(0,0,0,.18),inset 0 0 0 12px rgba(205,178,127,.18);background:radial-gradient(circle at 50% 45%,rgba(205,178,127,.08),transparent 70%);}}
.cell svg{{width:300px;height:350px;filter:drop-shadow(0 18px 22px rgba(0,0,0,.55));}}
</style></head><body><div class="grid">{cells}</div></body></html>'''
    (BUILD / 'painel.html').write_text(html)
    print('Brasões e painel preparados.')


if __name__ == '__main__':
    main()
