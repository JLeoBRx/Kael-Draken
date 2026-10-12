import type { CSSProperties, ReactNode } from 'react'

/** Borda irregular do papel (determinística, para não variar entre servidor e cliente). */
function tornEdges(seed: number): string {
  let s = seed
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const left: string[] = []
  const right: string[] = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * 100
    left.push(`${(rand() * 1.4).toFixed(2)}% ${y.toFixed(2)}%`)
    right.push(`${(100 - rand() * 1.4).toFixed(2)}% ${y.toFixed(2)}%`)
  }
  return `polygon(${[...left, ...right.reverse()].join(', ')})`
}

function Emblem() {
  return (
    <svg className="parchment-scroll__emblem" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1.5 2.5" />
      <path
        d="M32 10c3 7 11 12 11 23a11 11 0 0 1-22 0c0-5 2.5-8.5 5-11 .4 3.6 2 6 4.5 7-1.5-6.5.2-13.4 1.5-19z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M32 30c1.8 3 4.5 4.8 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2.4 1.2-3.9 2.3-5 .3 1.4 1 2.3 2 2.8-.3-2.3-.3-4.4.2-6.3z" fill="#f3e5c4" />
    </svg>
  )
}

function Divider() {
  return (
    <svg className="parchment-scroll__divider" viewBox="0 0 240 16" aria-hidden="true">
      <path d="M0 8h96M144 8h96" stroke="currentColor" strokeWidth="0.8" />
      <path d="M100 8l4-4 4 4-4 4zM132 8l4-4 4 4-4 4z" fill="currentColor" />
      <path d="M120 0l3 8-3 8-3-8z" fill="currentColor" />
      <circle cx="120" cy="8" r="1.4" fill="#f3e5c4" />
    </svg>
  )
}

function WaxSeal() {
  const blob = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    const r = 30 + Math.sin(i * 2.7) * 1.8 + Math.cos(i * 1.3) * 1.2
    return `${(40 + Math.cos(a) * r).toFixed(1)},${(40 + Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
  return (
    <svg className="parchment-scroll__seal" viewBox="0 0 80 96" aria-hidden="true">
      <defs>
        <radialGradient id="cera" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#c0392b" />
          <stop offset="0.55" stopColor="#8e1b12" />
          <stop offset="1" stopColor="#4d0b07" />
        </radialGradient>
      </defs>
      <path d="M30 62l-8 32 10-7 6 9 4-34zM50 62l8 32-10-7-6 9-4-34z" fill="#6e1410" />
      <polygon points={blob} fill="url(#cera)" />
      <circle cx="40" cy="40" r="21" fill="none" stroke="#e8a28f" strokeOpacity="0.35" strokeWidth="1.2" />
      <path d="M40 24c2 5 8 8.5 8 16a8 8 0 0 1-16 0c0-3.6 1.8-6 3.6-7.8.3 2.6 1.4 4.2 3.2 5-1-4.6.2-9.4 1.2-13.2z" fill="#f2b8a6" fillOpacity="0.55" />
    </svg>
  )
}

/**
 * Pergaminho com rolos de madeira, papel envelhecido, selo de cera e
 * capitular. O conteúdo (HTML já filtrado pelo nível de spoiler) vem pronto
 * do servidor.
 */
export function Parchment({
  kicker,
  title,
  html,
  actions,
  unroll = false,
  titleId,
}: {
  kicker?: string
  title: string
  html: string
  actions?: ReactNode
  unroll?: boolean
  titleId?: string
}) {
  return (
    <div className={`parchment-scroll${unroll ? ' parchment-scroll--unroll' : ''}`}>
      <div className="parchment-scroll__rod parchment-scroll__rod--top" aria-hidden="true" />
      <div className="parchment-scroll__sheet-wrap">
        <div className="parchment-scroll__sheet" style={{ '--torn': tornEdges(7) } as CSSProperties}>
          <div className="parchment-scroll__inner">
            <Emblem />
            {kicker ? <p className="parchment-scroll__kicker">{kicker}</p> : null}
            <h2 className="parchment-scroll__title" id={titleId}>
              {title}
            </h2>
            <Divider />
            <div className="parchment-scroll__body" dangerouslySetInnerHTML={{ __html: html }} />
            {actions ? <div className="parchment-scroll__actions">{actions}</div> : null}
          </div>
          <WaxSeal />
        </div>
      </div>
      <div className="parchment-scroll__rod parchment-scroll__rod--bottom" aria-hidden="true" />
    </div>
  )
}
