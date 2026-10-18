import type { SVGProps } from 'react'

/**
 * Símbolos do Arquivo: um desenho em linha dourada para cada seção.
 * Substituem ícones genéricos e distinguem as páginas da enciclopédia
 * (o mesmo símbolo aparece no índice da página inicial, no cabeçalho da
 * seção e no menu). São ornamentos do site, não artes do universo.
 */
export type GlyphName =
  | 'atlas'
  | 'reinos'
  | 'personagens'
  | 'mitologia'
  | 'ressonancia'
  | 'cronologia'
  | 'locais'
  | 'manuscritos'
  | 'misterios'
  | 'livro'
  | 'novidades'
  | 'arquivo'
  | 'busca'

const FLAME = 'M24 17.2c.9 2 3.3 3.6 3.3 6.4a3.3 3.3 0 0 1-6.6 0c0-1.5.7-2.3 1.5-3.1.1.9.5 1.5 1.2 1.8 0-1.8.2-3.5.6-5.1Z'

const DRAWINGS: Record<GlyphName, React.ReactNode> = {
  // rosa dos ventos
  atlas: (
    <>
      <circle cx="24" cy="24" r="17.5" />
      <circle cx="24" cy="24" r="13.5" strokeWidth="0.6" opacity="0.6" />
      <path d="M24 4.5 26.6 21.4 43.5 24 26.6 26.6 24 43.5 21.4 26.6 4.5 24 21.4 21.4Z" />
      <path d="M24 4.5v39M4.5 24h39" strokeWidth="0.6" opacity="0.55" />
      <path d="m16.6 16.6 5.6 5.6m9.2-5.6-5.6 5.6m-9.2 9.2 5.6-5.6m9.2 5.6-5.6-5.6" strokeWidth="0.8" />
      <circle cx="24" cy="24" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // escudo heráldico com o losango da Chama
  reinos: (
    <>
      <path d="M24 5 39 10.5v13c0 9.6-6.3 16-15 19.5C15.3 39.5 9 33.1 9 23.5v-13Z" />
      <path d="M24 9.2 35 13.3v10.2c0 7.3-4.6 12.3-11 15.2-6.4-2.9-11-7.9-11-15.2V13.3Z" strokeWidth="0.6" opacity="0.6" />
      <path d="M24 16.5 30 23.5 24 30.5 18 23.5Z" />
      <path d="M24 20.2c.5 1 1.5 1.8 1.5 3.1a1.5 1.5 0 0 1-3 0c0-.7.3-1.1.7-1.5 0 .4.2.7.5.8 0-.8.1-1.6.3-2.4Z" fill="currentColor" stroke="none" />
    </>
  ),
  // camafeu com um busto
  personagens: (
    <>
      <ellipse cx="24" cy="24" rx="13" ry="17.5" />
      <ellipse cx="24" cy="24" rx="10" ry="14.3" strokeWidth="0.6" opacity="0.6" />
      <circle cx="24" cy="19.5" r="4.2" />
      <path d="M15.6 34.5c1.2-5 4.3-7.4 8.4-7.4s7.2 2.4 8.4 7.4" />
      <path d="M24 3.5 25.6 5.6 24 7.7 22.4 5.6ZM24 40.3l1.6 2.1-1.6 2.1-1.6-2.1Z" fill="currentColor" stroke="none" />
    </>
  ),
  // códice aberto sob uma chama
  mitologia: (
    <>
      <path d="M6 17.5c6-2.2 12-2.2 18 1 6-3.2 12-3.2 18-1v20c-6-2.2-12-2.2-18 1-6-3.2-12-3.2-18-1Z" />
      <path d="M24 18.5v20" />
      <path d="M10 22.5c3.4-.9 6.8-.7 10 .6M10 27c3.4-.9 6.8-.7 10 .6M28 23.1c3.2-1.3 6.6-1.5 10-.6M28 27.6c3.2-1.3 6.6-1.5 10-.6" strokeWidth="0.7" opacity="0.7" />
      <path d="M24 3.8c1.1 2.4 3.9 4.3 3.9 7.6a3.9 3.9 0 0 1-7.8 0c0-1.8.9-2.8 1.8-3.7.1 1.1.6 1.8 1.4 2.1 0-2.1.2-4.1.7-6Z" fill="currentColor" stroke="none" />
    </>
  ),
  // anéis de ressonância em torno de uma chama
  ressonancia: (
    <>
      <circle cx="24" cy="24" r="8" />
      <circle cx="24" cy="24" r="13" strokeWidth="0.9" strokeDasharray="2.2 2.6" />
      <circle cx="24" cy="24" r="18.5" strokeWidth="0.6" opacity="0.65" />
      <path d="M24 3v3.5M24 41.5V45M3 24h3.5M41.5 24H45" strokeWidth="0.8" />
      <path d={FLAME} fill="currentColor" stroke="none" />
    </>
  ),
  // ampulheta
  cronologia: (
    <>
      <path d="M13 5.5h22M13 42.5h22" />
      <path d="M16 5.5c0 9 4.2 13.4 8 18.5 3.8-5.1 8-9.5 8-18.5M16 42.5c0-9 4.2-13.4 8-18.5 3.8 5.1 8 9.5 8 18.5" />
      <path d="M15 5.5v37M33 5.5v37" strokeWidth="0.6" opacity="0.55" />
      <path d="M19.5 41.5h9L24 35.6Z" fill="currentColor" stroke="none" />
      <path d="M24 26v7" strokeWidth="0.7" strokeDasharray="1 1.6" />
    </>
  ),
  // torre com ameias e porta em arco
  locais: (
    <>
      <path d="M16 42.5v-25h16v25" />
      <path d="M14 17.5v-6h4v3h4v-3h4v3h4v-3h4v6Z" />
      <path d="M21 42.5v-6.5a3 3 0 0 1 6 0v6.5" />
      <path d="M22.6 24.5h2.8v4h-2.8Z" strokeWidth="0.9" />
      <path d="M8 42.5h32" />
      <path d="M24 3.5v8M24 3.8l5 1.8-5 1.8" strokeWidth="0.9" />
    </>
  ),
  // rolo de pergaminho com selo
  manuscritos: (
    <>
      <path d="M14.5 8.5h20a3 3 0 0 1 0 6h-20a3 3 0 0 1 0-6Z" />
      <path d="M16 14.5v20.5M33 14.5v20.5" />
      <path d="M12.5 35h21a3 3 0 0 1 0 6h-21a3 3 0 0 1 0-6Z" />
      <path d="M19.5 20h10M19.5 24h10M19.5 28h6" strokeWidth="0.8" opacity="0.75" />
      <circle cx="31.5" cy="36.5" r="3.6" fill="currentColor" stroke="none" />
      <path d="m29.5 39.5-1.2 4.2M33.5 39.5l1.2 4.2" strokeWidth="1" />
    </>
  ),
  // fechadura num losango
  misterios: (
    <>
      <path d="M24 3.5 44.5 24 24 44.5 3.5 24Z" />
      <path d="M24 8.3 39.7 24 24 39.7 8.3 24Z" strokeWidth="0.6" opacity="0.6" />
      <circle cx="24" cy="21" r="3.8" fill="currentColor" stroke="none" />
      <path d="M22.2 23.6 20.8 31h6.4l-1.4-7.4Z" fill="currentColor" stroke="none" />
    </>
  ),
  // livro fechado com fecho e a Chama na capa
  livro: (
    <>
      <path d="M12.5 6.5H35a2 2 0 0 1 2 2v33H14.5a2 2 0 0 1-2-2Z" />
      <path d="M17 6.5v35" strokeWidth="0.8" />
      <path d="M37 20h3.5v8H37" strokeWidth="1" />
      <path d="M27 15.5 32 21.5 27 27.5 22 21.5Z" strokeWidth="0.9" />
      <path d="M27 18.6c.5 1 1.4 1.7 1.4 3a1.4 1.4 0 0 1-2.8 0c0-.7.3-1.1.7-1.4 0 .4.2.6.4.8 0-.8.1-1.6.3-2.4Z" fill="currentColor" stroke="none" />
      <path d="M21 33h12" strokeWidth="0.7" opacity="0.7" />
    </>
  ),
  // pena e traço de tinta
  novidades: (
    <>
      <path d="M38.5 5.5C28 8.4 19.6 17.3 15.8 30.2L13 42.5" />
      <path d="M38.5 5.5c-.8 9.6-7.1 19.3-19.4 25.6" />
      <path d="M33.6 10.8 27.4 12M30.4 16.4l-6.6 1M27.2 21.6l-6 .5" strokeWidth="0.7" opacity="0.75" />
      <path d="M9 42.5h17" strokeWidth="1" />
      <circle cx="29.5" cy="42.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  // o losango da Chama (marca do Arquivo)
  arquivo: (
    <>
      <path d="M24 3.5 44.5 24 24 44.5 3.5 24Z" />
      <path d="M24 9.5 38.5 24 24 38.5 9.5 24Z" strokeWidth="0.6" opacity="0.6" />
      <path d={FLAME} transform="translate(-9.6 -7.6) scale(1.4)" fill="currentColor" stroke="none" />
    </>
  ),
  // lupa
  busca: (
    <>
      <circle cx="21" cy="21" r="12" />
      <circle cx="21" cy="21" r="8.5" strokeWidth="0.6" opacity="0.6" />
      <path d="m30 30 11 11" strokeWidth="1.8" />
    </>
  ),
}

export function Glyph({ name, title, ...props }: { name: GlyphName; title?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {DRAWINGS[name]}
    </svg>
  )
}
