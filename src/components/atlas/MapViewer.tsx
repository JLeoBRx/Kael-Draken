'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { CloseIcon, ExpandIcon, MinusIcon, PlusIcon, ResetIcon } from '@/components/ui/icons'
import { CartographicBase } from './Cartography'

export interface ViewerMarker {
  id: number
  label: string
  markerType: string
  x: number
  y: number
  description: string
  provisional: boolean
  href: string | null
  status?: string
}

export interface ViewerImage {
  src: string
  width: number
  height: number
  alt: string
}

interface Props {
  title: string
  image: ViewerImage | null
  markers: ViewerMarker[]
  provisional: boolean
  typeLabels: Record<string, string>
  /** Destaca e abre um marcador ao carregar (ex.: ?marcador=12). */
  initialMarkerId?: number | null
  /** Modo de edição do painel: clique no mapa informa a posição. */
  onPick?: (x: number, y: number) => void
  pickLabel?: string
}

const MIN_SCALE = 1
const MAX_SCALE = 8
const BASE_W = 1600
const BASE_H = 1000

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function MapViewer({ title, image, markers, provisional, typeLabels, initialMarkerId = null, onPick, pickLabel }: Props) {
  const iw = image?.width || BASE_W
  const ih = image?.height || BASE_H
  const ratio = iw / ih

  const wrapperRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const [animated, setAnimated] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(initialMarkerId)
  const [dragging, setDragging] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ startDist: number; startScale: number; lastX: number; lastY: number; moved: boolean } | null>(null)
  const popoverId = useId()

  // Tamanho-base: o mapa inteiro cabe na área visível (nunca é cortado).
  const fit = size.w && size.h ? Math.min(size.w / iw, size.h / ih) : 0
  const baseW = iw * fit
  const baseH = ih * fit

  const clampView = useCallback(
    (scale: number, x: number, y: number) => {
      const cw = baseW * scale
      const ch = baseH * scale
      const nx = cw <= size.w ? (size.w - cw) / 2 : clamp(x, size.w - cw, 0)
      const ny = ch <= size.h ? (size.h - ch) / 2 : clamp(y, size.h - ch, 0)
      return { scale, x: nx, y: ny }
    },
    [baseW, baseH, size.w, size.h],
  )

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    // Ajusta a vista quando o tamanho da área muda (rotação, tela cheia…).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView((v) => clampView(v.scale, v.x, v.y))
  }, [clampView])

  const zoomAt = useCallback(
    (factor: number, cx = size.w / 2, cy = size.h / 2, animate = false) => {
      setAnimated(animate)
      setView((v) => {
        const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
        const k = scale / v.scale
        return clampView(scale, cx - (cx - v.x) * k, cy - (cy - v.y) * k)
      })
    },
    [clampView, size.w, size.h],
  )

  const reset = useCallback(() => {
    setAnimated(true)
    setView(clampView(1, 0, 0))
  }, [clampView])

  const focusMarker = useCallback(
    (marker: ViewerMarker) => {
      setActiveId(marker.id)
      setAnimated(true)
      setView((v) => {
        const scale = Math.max(v.scale, 2)
        const mx = (marker.x / 100) * baseW * scale
        const my = (marker.y / 100) * baseH * scale
        return clampView(scale, size.w / 2 - mx, size.h / 2 - my)
      })
    },
    [baseW, baseH, clampView, size.w, size.h],
  )

  // Abre o marcador indicado pelo endereço, depois que o tamanho é conhecido.
  const initialDone = useRef(false)
  useEffect(() => {
    if (initialDone.current || !initialMarkerId || !size.w) return
    const marker = markers.find((m) => m.id === initialMarkerId)
    initialDone.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (marker) focusMarker(marker)
  }, [initialMarkerId, markers, size.w, focusMarker])

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    viewportRef.current?.setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    setAnimated(false)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startScale: view.scale, lastX: (a.x + b.x) / 2, lastY: (a.y + b.y) / 2, moved: true }
    } else {
      gesture.current = { startDist: 0, startScale: view.scale, lastX: p.x, lastY: p.y, moved: false }
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      setView((v) => {
        const scale = clamp((g.startScale * dist) / (g.startDist || dist), MIN_SCALE, MAX_SCALE)
        const k = scale / v.scale
        return clampView(scale, mx - (mx - v.x) * k + (mx - g.lastX), my - (my - v.y) * k + (my - g.lastY))
      })
      g.lastX = mx
      g.lastY = my
      return
    }
    const dx = p.x - g.lastX
    const dy = p.y - g.lastY
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      g.moved = true
      setDragging(true)
    }
    g.lastX = p.x
    g.lastY = p.y
    setView((v) => clampView(v.scale, v.x + dx, v.y + dy))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) {
      setDragging(false)
      if (g && !g.moved) {
        if (onPick) {
          const p = local(e)
          const x = ((p.x - view.x) / (baseW * view.scale)) * 100
          const y = ((p.y - view.y) / (baseH * view.scale)) * 100
          if (x >= 0 && x <= 100 && y >= 0 && y <= 100) onPick(Math.round(x * 100) / 100, Math.round(y * 100) / 100)
        } else {
          setActiveId(null)
        }
      }
      gesture.current = null
    } else if (pointers.current.size === 1) {
      const [rest] = [...pointers.current.values()]
      gesture.current = { startDist: 0, startScale: view.scale, lastX: rest.x, lastY: rest.y, moved: true }
    }
  }

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const isFullscreen = typeof document !== 'undefined' && document.fullscreenElement === wrapperRef.current
    if (!e.ctrlKey && !e.metaKey && !isFullscreen) return
    e.preventDefault()
    const p = local(e)
    zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, p.x, p.y)
  }

  // O React registra "wheel" como passivo; para impedir a rolagem da página
  // durante o zoom com Ctrl, o ouvinte nativo precisa ser não passivo.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const stop = (e: globalThis.WheelEvent) => {
      if (e.ctrlKey || e.metaKey || document.fullscreenElement === wrapperRef.current) e.preventDefault()
    }
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 60
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[e.key]) {
      e.preventDefault()
      setAnimated(true)
      setView((v) => clampView(v.scale, v.x + moves[e.key][0], v.y + moves[e.key][1]))
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoomAt(1.4, undefined, undefined, true)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoomAt(1 / 1.4, undefined, undefined, true)
    } else if (e.key === '0') {
      e.preventDefault()
      reset()
    } else if (e.key === 'Escape') {
      setActiveId(null)
    }
  }

  const toggleFullscreen = () => {
    const el = wrapperRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }

  const active = markers.find((m) => m.id === activeId) ?? null
  const popoverStyle: CSSProperties | undefined = active
    ? (() => {
        const mx = view.x + (active.x / 100) * baseW * view.scale
        const my = view.y + (active.y / 100) * baseH * view.scale
        const w = Math.min(300, size.w - 24)
        const left = clamp(mx + 18, 12, Math.max(12, size.w - w - 12))
        const top = clamp(my + 18, 12, Math.max(12, size.h - 190))
        return { left, top }
      })()
    : undefined

  const typesInUse = [...new Set(markers.map((m) => m.markerType))]
  const canvasStyle: CSSProperties = {
    width: baseW || '100%',
    height: baseH || '100%',
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
    ['--marker-scale' as string]: 1 / view.scale,
  }

  return (
    <div className="map-viewer" ref={wrapperRef}>
      <div
        ref={viewportRef}
        className={`map-viewer__viewport${dragging ? ' is-dragging' : ''}`}
        style={{ '--map-ratio': `${ratio}`, touchAction: view.scale > 1 ? 'none' : 'pan-y' } as CSSProperties}
        tabIndex={0}
        role="region"
        aria-roledescription="mapa interativo"
        aria-label={`${title}. Use as setas para mover, + e − para ampliar e 0 para restaurar.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button, a') || onPick) return
          const p = local(e)
          zoomAt(2, p.x, p.y, true)
        }}
        onKeyDown={onKeyDown}
      >
        <div className={`map-viewer__canvas${animated ? ' is-animated' : ''}`} style={canvasStyle}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- o zoom exige a imagem em resolução integral
            <img className="map-viewer__image" src={image.src} alt={image.alt || title} width={iw} height={ih} draggable={false} />
          ) : (
            <CartographicBase title={title} />
          )}
          {markers.map((m) => (
            <button
              key={m.id}
              type="button"
              className="marker"
              data-type={m.markerType}
              data-provisional={m.provisional}
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
              aria-expanded={activeId === m.id}
              aria-controls={activeId === m.id ? popoverId : undefined}
              aria-label={`${m.label}${typeLabels[m.markerType] ? ` — ${typeLabels[m.markerType]}` : ''}${m.provisional ? ' (posição provisória)' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setActiveId(activeId === m.id ? null : m.id)
              }}
            >
              <span className="marker__glyph" aria-hidden="true" />
              {view.scale >= 1.6 || markers.length <= 12 ? (
                <span className="marker__label" aria-hidden="true">
                  {m.label}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {provisional ? <p className="map-viewer__ribbon">Mapa provisório · geografia em desenvolvimento</p> : null}
        {onPick && pickLabel ? <p className="map-viewer__hint">{pickLabel}</p> : null}
        {!onPick && size.w ? <p className="map-viewer__hint">Arraste para mover · Ctrl + rolagem ou pinça para ampliar</p> : null}

        {active ? (
          <div className="map-popover" id={popoverId} role="dialog" aria-label={active.label} style={popoverStyle} onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="map-popover__close" onClick={() => setActiveId(null)} aria-label="Fechar">
              <CloseIcon width={18} height={18} />
            </button>
            <p className="map-popover__type">
              {typeLabels[active.markerType] ?? active.markerType}
              {active.provisional ? ' · posição provisória' : ''}
            </p>
            <h3>{active.label}</h3>
            {active.description ? <p>{active.description}</p> : null}
            {active.href ? (
              <p className="map-popover__actions">
                <Link className="text-link" href={active.href}>
                  Abrir verbete →
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="map-viewer__toolbar" role="toolbar" aria-label="Controles do mapa">
        <button type="button" onClick={() => zoomAt(1.5, undefined, undefined, true)} aria-label="Ampliar">
          <PlusIcon />
        </button>
        <button type="button" onClick={() => zoomAt(1 / 1.5, undefined, undefined, true)} aria-label="Reduzir">
          <MinusIcon />
        </button>
        <button type="button" onClick={reset} aria-label="Restaurar vista">
          <ResetIcon />
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label="Tela cheia">
          <ExpandIcon />
        </button>
      </div>

      {typesInUse.length ? (
        <div className="map-legend" aria-label="Legenda">
          <ul>
            {typesInUse.map((type) => (
              <li key={type}>
                <span className="marker" data-type={type} style={{ position: 'static', margin: 0, width: 14, height: 14 }}>
                  <span className="marker__glyph" aria-hidden="true" />
                </span>
                {typeLabels[type] ?? type}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {markers.length && !onPick ? (
        <div className="map-meta">
          <nav className="marker-index" aria-label="Lugares marcados neste mapa" style={{ marginTop: 0 }}>
            <ul>
              {markers.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => focusMarker(m)}>
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  )
}
