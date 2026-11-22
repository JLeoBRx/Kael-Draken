/** Criação de elementos com atributos e filhos, sem framework. */
type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'class') el.className = String(v)
    else if (k === 'html') el.innerHTML = String(v)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

/** Emblema do jogo (chama estilizada dentro de um hexágono). Original, em SVG. */
export const EMBLEM_SVG = `
<svg viewBox="0 0 120 120" aria-hidden="true" class="emblem">
  <defs>
    <linearGradient id="g-flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff4d2e"/>
      <stop offset="0.55" stop-color="#ff8a2f"/>
      <stop offset="1" stop-color="#ffd36b"/>
    </linearGradient>
  </defs>
  <path d="M60 6 106 32v56L60 114 14 88V32Z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" opacity="0.9"/>
  <path d="M60 22c4 14 22 22 22 44a22 22 0 0 1-44 0c0-10 5-17 10-22 0 8 4 13 9 14-5-12 0-25 3-36Z" fill="url(#g-flame)"/>
  <path d="M60 58c2 7 10 10 10 19a10 10 0 0 1-20 0c0-5 3-9 6-11 0 4 2 6 4 6-2-5 0-10 0-14Z" fill="#fff4d6" opacity="0.9"/>
</svg>`
