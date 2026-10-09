'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { setSpoilerLevel } from '@/app/actions/spoiler'
import { SPOILER_INFO, SPOILER_LEVELS, type SpoilerLevel } from '@/lib/editorial'
import { EyeIcon } from '@/components/ui/icons'

function Option({ level, current, onAdvanced }: { level: SpoilerLevel; current: SpoilerLevel; onAdvanced: (e: React.MouseEvent) => void }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name="level"
      value={level}
      className="spoiler-option"
      aria-pressed={current === level}
      disabled={pending}
      onClick={level === 2 && current !== 2 ? onAdvanced : undefined}
    >
      <span className="spoiler-option__label">{SPOILER_INFO[level].label}</span>
      <span className="spoiler-option__desc">{SPOILER_INFO[level].description}</span>
    </button>
  )
}

export function SpoilerControl({ current }: { current: SpoilerLevel }) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirming(false)
  }, [current])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false
        detailsRef.current.querySelector('summary')?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (detailsRef.current?.open && !detailsRef.current.contains(e.target as Node)) detailsRef.current.open = false
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <details className="spoiler-control" ref={detailsRef} id="nivel-de-spoiler">
      <summary className="icon-button" aria-label={`Nível de spoiler: ${SPOILER_INFO[current].label}. Alterar`}>
        <EyeIcon />
        <span className="spoiler-control__level" aria-hidden="true">
          {SPOILER_INFO[current].label}
        </span>
      </summary>
      <div className="spoiler-control__panel">
        <h2>Nível de spoiler</h2>
        <p>Escolha o quanto deseja saber. Trechos acima do seu nível nunca são enviados ao seu navegador.</p>
        <form action={setSpoilerLevel}>
          <ul className="spoiler-options">
            {SPOILER_LEVELS.map((level) => (
              <li key={level}>
                <Option
                  level={level}
                  current={current}
                  onAdvanced={(e) => {
                    if (!confirming) {
                      e.preventDefault()
                      setConfirming(true)
                    }
                  }}
                />
              </li>
            ))}
          </ul>
          {confirming ? (
            <div className="spoiler-confirm" role="alert">
              <strong>Revelações avançadas</strong> exibem segredos profundos de personagens e da história já documentados no arquivo. Deseja continuar?
              <div className="spoiler-confirm__actions">
                <button type="submit" name="level" value={2} className="btn btn--primary btn--small">
                  Sim, mostrar
                </button>
                <button type="button" className="btn btn--small" onClick={() => setConfirming(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </form>
      </div>
    </details>
  )
}
