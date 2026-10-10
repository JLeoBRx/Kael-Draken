'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { ArtState } from '@/lib/editorial'
import type { IllustrationItem } from '@/lib/illustrations'
import { ImageSlot } from '../ui/media'
import { ArrowRight, CloseIcon } from '../ui/icons'


export function ArtStateBadge({ state, label }: { state: ArtState; label: string }) {
  return (
    <span className={`badge art-state art-state--${state}`}>
      <span className="badge__mark" aria-hidden="true" />
      {label}
    </span>
  )
}

/**
 * Galeria das ilustrações dos capítulos. Cada cartão com imagem abre uma
 * visualização ampliada (<dialog> modal): Esc, o botão Fechar, um clique fora
 * da imagem ou o botão Voltar do navegador fecham e devolvem o foco ao cartão.
 * O endereço recebe #identificador, para que a ilustração possa ser compartilhada.
 * Sem JavaScript, o cartão é um link para o arquivo da imagem.
 */
export function IllustrationGallery({ items }: { items: IllustrationItem[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const pushedRef = useRef(false)
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<number | null>(null)

  const viewable = items.map((item, index) => (item.image ? index : -1)).filter((i) => i >= 0)
  const item = current !== null ? items[current] : null
  const position = current !== null ? viewable.indexOf(current) : -1

  const show = useCallback((index: number, push: boolean) => {
    const dialog = dialogRef.current
    if (!dialog) return
    setCurrent(index)
    if (!dialog.open) {
      if (!openerRef.current) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
    }
    const hash = `#${items[index].slug}`
    if (push && window.location.hash !== hash) {
      window.history.pushState(null, '', hash)
      pushedRef.current = true
    }
  }, [items])

  const close = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  const step = useCallback(
    (delta: number) => {
      if (current === null || viewable.length < 2) return
      const next = viewable[(viewable.indexOf(current) + delta + viewable.length) % viewable.length]
      setCurrent(next)
      window.history.replaceState(null, '', `#${items[next].slug}`)
    },
    [current, viewable, items],
  )

  // Fechamento por qualquer meio: limpa o endereço e devolve o foco ao cartão de origem.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onClose = () => {
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      } else if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      const opener = openerRef.current
      openerRef.current = null
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
      setCurrent(null)
    }
    dialog.addEventListener('close', onClose)
    return () => dialog.removeEventListener('close', onClose)
  }, [])

  // Endereço com #identificador (link compartilhado ou botões Voltar/Avançar).
  useEffect(() => {
    const sync = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1))
      const index = items.findIndex((i) => i.slug === slug && i.image)
      const dialog = dialogRef.current
      if (index >= 0) show(index, false)
      else if (dialog?.open) {
        pushedRef.current = false
        dialog.close()
      }
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [items, show])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      step(-1)
    }
  }

  const onCardClick = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    openerRef.current = event.currentTarget
    show(index, true)
  }

  return (
    <>
      <ol className="illus-grid">
        {items.map((it, index) => (
          <li key={it.slug} id={it.slug} className="illus-card">
            <figure className="illus-card__figure">
              {it.image ? (
                <a
                  className="illus-card__frame"
                  href={it.image.src}
                  onClick={(e) => onCardClick(e, index)}
                  aria-label={`Ampliar a ilustração do ${it.label.toLowerCase()}: ${it.chapterTitle}`}
                >
                  <Image
                    src={it.image.src}
                    width={it.image.width}
                    height={it.image.height}
                    alt=""
                    sizes="(min-width: 1280px) 230px, (min-width: 1000px) 22vw, (min-width: 640px) 30vw, 46vw"
                    className="illus-card__img"
                  />
                </a>
              ) : (
                <div className="illus-card__frame illus-card__frame--pending">
                  <ImageSlot ratio="31 / 46" label={it.stateLabel} />
                </div>
              )}
              <figcaption className="illus-card__caption">
                <span className="illus-card__num">{it.label}</span>
                <span className="illus-card__title">{it.chapterTitle}</span>
                <ArtStateBadge state={it.artState} label={it.stateLabel} />
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>

      <dialog
        ref={dialogRef}
        className="illus-dialog"
        aria-labelledby="illus-dialog-title"
        onKeyDown={onKeyDown}
        onClick={(e) => {
          // clique no fundo escurecido (fora do conteúdo) fecha
          if (e.target === e.currentTarget) close()
        }}
      >
        {item?.image ? (
          <div className="illus-dialog__inner">
            {/* primeiro elemento focável: recebe o foco ao abrir */}
            <button type="button" className="illus-dialog__close" onClick={close} aria-label="Fechar a visualização ampliada" autoFocus>
              <CloseIcon width={22} height={22} />
            </button>
            <div
              className="illus-dialog__stage"
              onTouchStart={(e) => {
                touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
              }}
              onTouchEnd={(e) => {
                const start = touchRef.current
                touchRef.current = null
                if (!start) return
                const dx = e.changedTouches[0].clientX - start.x
                const dy = e.changedTouches[0].clientY - start.y
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
              }}
            >
              <Image
                key={item.slug}
                src={item.image.src}
                width={item.image.width}
                height={item.image.height}
                alt={item.image.alt}
                sizes="(min-width: 1100px) 62vw, 100vw"
                quality={90}
                className="illus-dialog__img"
                priority
              />
            </div>
            <div className="illus-dialog__info">
              <p className="eyebrow">
                {item.label}
                {viewable.length > 1 ? (
                  <span className="illus-dialog__count">
                    {' '}
                    · {position + 1} de {viewable.length}
                  </span>
                ) : null}
              </p>
              <h2 id="illus-dialog-title" className="illus-dialog__title">
                {item.chapterTitle}
              </h2>
              <div>
                <ArtStateBadge state={item.artState} label={item.stateLabel} />
                <p className="illus-dialog__state">{item.stateDescription}</p>
              </div>
              {item.caption ? <p className="illus-dialog__caption">{item.caption}</p> : null}
              <details className="illus-dialog__alt">
                <summary>Descrição da imagem</summary>
                <p>{item.image.alt}</p>
              </details>
              {item.credit ? <p className="illus-dialog__credit">Crédito: {item.credit}</p> : null}
              {item.chapterHref ? (
                <Link className="btn btn--gold btn--small" href={item.chapterHref}>
                  Ler o capítulo <ArrowRight className="btn__arrow" width={14} height={14} />
                </Link>
              ) : null}
              {viewable.length > 1 ? (
                <div className="illus-dialog__nav">
                  <button type="button" className="btn btn--small" onClick={() => step(-1)}>
                    ← Anterior
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => step(1)}>
                    Próxima →
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
