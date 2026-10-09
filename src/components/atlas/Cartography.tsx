/**
 * Elementos cartográficos desenhados em SVG.
 *
 * A carta-base é deliberadamente vazia de geografia: apenas graticulado,
 * linhas de rumo (à maneira dos portulanos), rosa dos ventos, escala e
 * cartela. Ela ocupa o lugar do mapa oficial enquanto a geografia não for
 * aprovada — nenhuma costa, rio ou fronteira é inventada.
 */

function rhumbLines(cx: number, cy: number, radius: number, count = 32) {
  const lines: Array<{ x2: number; y2: number; major: boolean }> = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    lines.push({ x2: cx + Math.cos(angle) * radius, y2: cy + Math.sin(angle) * radius, major: i % 4 === 0 })
  }
  return lines
}

function CompassRose({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={s} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      <circle r={s * 0.82} fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
      {Array.from({ length: 32 }).map((_, i) => {
        const a = (i / 32) * Math.PI * 2
        const r1 = s * (i % 4 === 0 ? 0.7 : 0.78)
        return <line key={i} x1={Math.cos(a) * r1} y1={Math.sin(a) * r1} x2={Math.cos(a) * s * 0.82} y2={Math.sin(a) * s * 0.82} stroke="currentColor" strokeWidth="0.6" opacity="0.5" />
      })}
      {[0, 90, 180, 270].map((deg) => (
        <path key={deg} transform={`rotate(${deg})`} d={`M0 ${-s * 0.95} L${s * 0.12} 0 L0 ${s * 0.12} L${-s * 0.12} 0 Z`} fill="currentColor" opacity="0.75" />
      ))}
      {[45, 135, 225, 315].map((deg) => (
        <path key={deg} transform={`rotate(${deg})`} d={`M0 ${-s * 0.6} L${s * 0.08} 0 L0 ${s * 0.08} L${-s * 0.08} 0 Z`} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
      ))}
      <circle r={s * 0.06} fill="currentColor" />
      <text y={-s - 10} textAnchor="middle" fontSize={s * 0.22} fill="currentColor" opacity="0.8" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
        N
      </text>
    </g>
  )
}

export function CartographicBase({ title = 'Carta dos Seis Reinos', note = 'Geografia em elaboração' }: { title?: string; note?: string }) {
  const W = 1600
  const H = 1000
  const roses = [
    { x: 800, y: 500, r: 1100 },
    { x: 260, y: 230, r: 700 },
    { x: 1340, y: 770, r: 700 },
  ]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${title} — carta-base provisória, sem geografia definida`}>
      <defs>
        <radialGradient id="cb-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#1d1b18" />
          <stop offset="100%" stopColor="#0b0a09" />
        </radialGradient>
        <pattern id="cb-grain" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="#ffffff" opacity="0.025" />
          <circle cx="4" cy="3.5" r="0.4" fill="#000000" opacity="0.25" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#cb-vignette)" />
      <rect width={W} height={H} fill="url(#cb-grain)" />

      <g color="#b8975a">
        {/* graticulado */}
        <g stroke="currentColor" strokeWidth="0.6" opacity="0.14">
          {Array.from({ length: 15 }).map((_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 100} y1={40} x2={(i + 1) * 100} y2={H - 40} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`h${i}`} x1={40} y1={(i + 1) * 100} x2={W - 40} y2={(i + 1) * 100} />
          ))}
        </g>

        {/* linhas de rumo */}
        {roses.map((rose, ri) => (
          <g key={ri} stroke="currentColor" opacity={ri === 0 ? 0.16 : 0.1}>
            {rhumbLines(rose.x, rose.y, rose.r).map((l, i) => (
              <line key={i} x1={rose.x} y1={rose.y} x2={l.x2} y2={l.y2} strokeWidth={l.major ? 0.9 : 0.5} />
            ))}
          </g>
        ))}

        {/* moldura com graduação */}
        <rect x="24" y="24" width={W - 48} height={H - 48} fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
        <rect x="40" y="40" width={W - 80} height={H - 80} fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.5" />
        <g stroke="currentColor" strokeWidth="0.8" opacity="0.5">
          {Array.from({ length: 31 }).map((_, i) => (
            <g key={i}>
              <line x1={40 + i * 50.66} y1={24} x2={40 + i * 50.66} y2={i % 2 ? 32 : 40} />
              <line x1={40 + i * 50.66} y1={H - 24} x2={40 + i * 50.66} y2={H - (i % 2 ? 32 : 40)} />
            </g>
          ))}
          {Array.from({ length: 19 }).map((_, i) => (
            <g key={i}>
              <line x1={24} y1={40 + i * 51.1} x2={i % 2 ? 32 : 40} y2={40 + i * 51.1} />
              <line x1={W - 24} y1={40 + i * 51.1} x2={W - (i % 2 ? 32 : 40)} y2={40 + i * 51.1} />
            </g>
          ))}
        </g>

        <CompassRose x={1380} y={210} size={92} />

        {/* escala */}
        <g transform="translate(1180 905)" opacity="0.7">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 70} y={0} width={70} height={8} fill={i % 2 ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1" />
          ))}
          <text x="140" y="32" textAnchor="middle" fontSize="18" fill="currentColor" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
            escala a definir
          </text>
        </g>

        {/* cartela */}
        <g transform="translate(96 800)">
          <rect width="520" height="128" fill="#0e0d0c" fillOpacity="0.85" stroke="currentColor" strokeWidth="1" opacity="0.9" />
          <rect x="8" y="8" width="504" height="112" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
          <text x="260" y="58" textAnchor="middle" fontSize="40" fill="#ebe4d4" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>
            {title}
          </text>
          <text x="260" y="96" textAnchor="middle" fontSize="22" fill="currentColor" style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
            {note}
          </text>
        </g>

        <text x={800} y={520} textAnchor="middle" fontSize="30" fill="currentColor" opacity="0.32" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.6em' }}>
          TERRA INCOGNITA
        </text>
      </g>
    </svg>
  )
}

/** Textura de linhas de rumo usada discretamente no fundo da página inicial. */
export function PortolanTexture() {
  const W = 1600
  const H = 900
  const roses = [
    { x: 1150, y: 420, r: 1300 },
    { x: 220, y: 760, r: 800 },
  ]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {roses.map((rose, ri) => (
        <g key={ri} stroke="currentColor">
          {rhumbLines(rose.x, rose.y, rose.r).map((l, i) => (
            <line key={i} x1={rose.x} y1={rose.y} x2={l.x2} y2={l.y2} strokeWidth={l.major ? 1 : 0.5} />
          ))}
          <circle cx={rose.x} cy={rose.y} r={ri === 0 ? 160 : 90} fill="none" strokeWidth="1" />
          <circle cx={rose.x} cy={rose.y} r={ri === 0 ? 172 : 98} fill="none" strokeWidth="0.5" />
        </g>
      ))}
    </svg>
  )
}
