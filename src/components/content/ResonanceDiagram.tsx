import Link from 'next/link'

/**
 * Diagrama das seis faces propostas. Os nomes vêm do conteúdo do arquivo;
 * o diagrama não associa faces a reinos nem sugere relações entre elas.
 */
export function ResonanceDiagram({ faces, href }: { faces: Array<{ name: string; href?: string }>; href: string }) {
  const size = 560
  const c = size / 2
  const r = 190
  const points = faces.map((_, i) => {
    const a = -Math.PI / 2 + (i / faces.length) * Math.PI * 2
    return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r }
  })
  return (
    <figure className="resonance-diagram">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby="diagrama-titulo diagrama-desc">
        <title id="diagrama-titulo">As seis faces propostas da Ressonância</title>
        <desc id="diagrama-desc">{`Seis faces de nomes provisórios dispostas ao redor da Ressonância: ${faces.map((f) => f.name).join(', ')}.`}</desc>
        <circle cx={c} cy={c} r={r + 46} fill="none" stroke="#3a3530" strokeWidth="1" />
        <circle cx={c} cy={c} r={r - 46} fill="none" stroke="#3a3530" strokeWidth="1" strokeDasharray="2 6" />
        {points.length > 2 ? (
          <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#5c4a2c" strokeWidth="1" />
        ) : null}
        <circle cx={c} cy={c} r="64" fill="#140d0b" stroke="#9c2c1c" strokeWidth="1.5" />
        <text x={c} y={c + 7} textAnchor="middle" fill="#ebe4d4" fontSize="22" style={{ fontFamily: 'var(--font-display)' }}>
          Ressonância
        </text>
        {faces.map((face, i) => {
          const p = points[i]
          return (
            <Link key={face.name} href={face.href ?? href} aria-label={`Face ${face.name} (nome provisório)`}>
              <circle cx={p.x} cy={p.y} r="44" fill="#131210" stroke="#b8975a" strokeWidth="1.2" />
              <text x={p.x} y={p.y + 7} textAnchor="middle" fill="#ddc9a2" fontSize="20" style={{ fontFamily: 'var(--font-display)' }}>
                {face.name}
              </text>
            </Link>
          )
        })}
      </svg>
      <figcaption>Diagrama provisório: nomes em revisão. Nenhuma face está associada a um reino, e a disposição circular não indica hierarquia ou relação entre elas.</figcaption>
    </figure>
  )
}

/** Extrai os nomes das faces de uma lista Markdown (ex.: "1. **Forja**"). */
export function parseFaceNames(markdown: string): string[] {
  const names: string[] = []
  for (const line of markdown.split('\n')) {
    const m = /^\s*(?:\d+\.|[-*])\s+\*\*([^*]+)\*\*/.exec(line)
    if (m) names.push(m[1].trim())
  }
  return names
}
