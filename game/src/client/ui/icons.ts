import { ITEM } from '../../shared/config/items'

/**
 * Ícones originais em SVG (silhuetas simples) para o HUD e o inventário.
 * viewBox 0 0 64 32, cor = currentColor.
 */
const PATHS: Record<number, string> = {
  [ITEM.Pistol]: 'M10 10h30v6H24l-2 2v8h-7l1-10h-6z M40 11h6v3h-6z',
  [ITEM.Smg]: 'M6 11h38v6H32l-1 9h-6l1-9h-6v6h-6v-6H6z M44 12h10v3H44z M8 17h5v5H8z',
  [ITEM.Rifle]: 'M2 12h12l2-2h30v6H34l-3 9h-6l2-9H22l-1 5h-5l1-5H2z M46 12h14v2H46z M24 7h6v3h-6z',
  [ITEM.Shotgun]: 'M2 13h10l4-3h44v4H36v4H16l-2 4H8l2-5H2z M30 18h8v3h-8z',
  [ITEM.Sniper]: 'M1 13h12l3-2h47v3H34l-4 2H18l-2 6h-5l2-6H1z M24 5h14v4H24z M28 9h3v2h-3z',
  [ITEM.Launcher]: 'M4 10h56v9H4z M18 19h5v8h-5z M32 19h4v6h-4z M8 6h8v4H8z',
  [ITEM.Grenade]: 'M32 9a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M30 4h6v5h-6z M36 5h6v2h-6z',
  [ITEM.Bandage]: 'M16 10h32v12H16z M22 10v12 M42 10v12',
  [ITEM.Medkit]: 'M18 8h28v18H18z M29 11h6v5h5v5h-5v4h-6v-4h-5v-5h5z',
  [ITEM.ShieldCell]: 'M27 6h10v3h2v19H25V9h2z',
  [ITEM.ShieldBattery]: 'M22 4h20v3h3v22H19V7h3z M27 12h10v3H27z M27 18h10v3H27z',
}

export function itemIconSvg(item: number): string {
  const d = PATHS[item]
  if (!d) return ''
  const stroke = item === ITEM.Bandage ? ' stroke="rgba(0,0,0,.35)" stroke-width="2"' : ''
  return `<svg viewBox="0 0 64 32" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"${stroke}/></svg>`
}
