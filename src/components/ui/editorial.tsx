import {
  CANON_INFO,
  CERTAINTY_INFO,
  PUBLICATION_INFO,
  RELIABILITY_INFO,
  SPOILER_INFO,
  type CanonState,
  type CertaintyState,
  type PublicationState,
  type ReliabilityState,
  type SpoilerLevel,
} from '@/lib/editorial'

export function CanonBadge({ canon, short = false }: { canon: string; short?: boolean }) {
  const info = CANON_INFO[canon as CanonState]
  if (!info) return null
  return (
    <span className={`badge badge--${canon}`} title={info.description}>
      <span className="badge__mark" aria-hidden="true" />
      <span>
        <span className="visually-hidden">Estado editorial: </span>
        {short ? info.short : info.label}
      </span>
    </span>
  )
}

export function SpoilerBadge({ level }: { level: number }) {
  if (!level) return null
  const info = SPOILER_INFO[level as SpoilerLevel]
  return (
    <span className="badge badge--spoiler" title="Este conteúdo só aparece para quem escolheu este nível de spoiler">
      <span className="badge__mark" aria-hidden="true" />
      {info.label}
    </span>
  )
}

export function DraftBadge({ status }: { status: string }) {
  if (status === 'publicado') return null
  return (
    <span className="badge badge--draft" title={PUBLICATION_INFO[status as PublicationState]?.description}>
      {PUBLICATION_INFO[status as PublicationState]?.label ?? status}
    </span>
  )
}

/** Conjunto de selos de um verbete: estado editorial, spoiler e (na pré-visualização) publicação. */
export function EditorialBadges({ canon, spoiler, status, preview }: { canon: string; spoiler?: number; status?: string; preview?: boolean }) {
  return (
    <div className="badges">
      <CanonBadge canon={canon} />
      {spoiler ? <SpoilerBadge level={spoiler} /> : null}
      {preview && status ? <DraftBadge status={status} /> : null}
    </div>
  )
}

export function CertaintyMark({ certainty }: { certainty: string }) {
  return <span className="certainty-mark" data-c={certainty} aria-hidden="true" />
}

export function CertaintyBadge({ certainty }: { certainty: string }) {
  const info = CERTAINTY_INFO[certainty as CertaintyState]
  if (!info) return null
  return (
    <span className="badge badge--plain" title={info.description}>
      <span className="visually-hidden">Certeza: </span>
      {info.label}
    </span>
  )
}

export function Reliability({ value }: { value: string }) {
  const info = RELIABILITY_INFO[value as ReliabilityState] ?? RELIABILITY_INFO.desconhecido
  return (
    <span className={`reliability reliability--${value}`} title={info.description}>
      {info.label}
    </span>
  )
}
