'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import type { AtlasRegionView } from '@/lib/atlas/regions'
import { MAP_VERSIONS, pointInPolygon, polygonPath, type MapVersionId } from '@/lib/atlas/world'
import type { ImageData } from '@/lib/content/media'
import { CloseIcon, ExpandIcon, MinusIcon, PlusIcon, ResetIcon } from '@/components/ui/icons'
import { isLowPowerDevice, webglAvailable } from './webgl'
import type { World3D } from './world3d'

interface Props {
  regions: AtlasRegionView[]
  images: Record<MapVersionId, ImageData>
  heightmap: { src: string; width: number; height: number; seaLevel: number }
  maskSrc: string
  /** Proporção largura/altura da carta. */
  aspect: number
  /** A carta já traz os nomes desenhados: os rótulos em texto ficam só para leitores de tela. */
  drawnLabels?: boolean
  initialVersion?: MapVersionId
  initialRegion?: string | null
}

type Mode = '2d' | 'loading' | '3d' | 'leaving'

const VB_W = 1500
const ERASED_LABEL = 'Terras sem registro'

function optimized(src: string, width: number) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`
}

export function WorldAtlas({ regions, images, heightmap, maskSrc, aspect, drawnLabels = false, initialVersion = 'original', initialRegion = null }: Props) {
  const VB_H = Math.round(VB_W / aspect)
  const [version, setVersion] = useState<MapVersionId>(initialVersion)
  const [selected, setSelected] = useState<string | null>(initialRegion && regions.some((r) => r.id === initialRegion) ? initialRegion : null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('2d')
  const [message, setMessage] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const panelId = useId()
  const stageRef = useRef<HTMLDivElement>(null)
  const glHostRef = useRef<HTMLDivElement>(null)
  const labelHostRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<World3D | null>(null)
  const maskRef = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null)
  const reducedMotion = useRef(false)

  const erased = MAP_VERSIONS[version].erased
  const isErased = useCallback((id: string) => erased.includes(id), [erased])
  const active = regions.find((r) => r.id === selected) ?? null

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(webglAvailable())
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const img = new window.Image()
    img.onload = () => {
      const w = 600
      const h = Math.round(600 / aspect)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, w, h)
      maskRef.current = { data: ctx.getImageData(0, 0, w, h).data, w, h }
    }
    img.src = maskSrc
  }, [maskSrc, aspect])

  // Mantém a seleção e a versão no endereço (links compartilháveis)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selected) url.searchParams.set('regiao', selected)
    else url.searchParams.delete('regiao')
    if (version !== 'original') url.searchParams.set('versao', version)
    else url.searchParams.delete('versao')
    window.history.replaceState(window.history.state, '', url)
  }, [selected, version])

  const regions3d = useMemo(
    () => regions.map((r) => ({ id: r.id, name: r.name, accent: r.accent, polygon: r.polygon, label: r.label, erased: erased.includes(r.id) })),
    [regions, erased],
  )

  const select = useCallback((id: string | null) => {
    setSelected(id)
    setSheetOpen(true)
  }, [])

  // Sincroniza seleção e versão com a cena 3D
  useEffect(() => {
    worldRef.current?.setSelected(selected)
  }, [selected])
  const lowPowerRef = useRef(false)
  useEffect(() => {
    if (worldRef.current) void worldRef.current.setVersion(optimized(images[version].src, lowPowerRef.current ? 1200 : 2048), regions3d)
  }, [version, images, regions3d])

  useEffect(() => () => worldRef.current?.dispose(), [])

  const isLand = (u: number, v: number) => {
    const m = maskRef.current
    if (!m) return true
    const x = Math.min(m.w - 1, Math.max(0, Math.round(u * (m.w - 1))))
    const y = Math.min(m.h - 1, Math.max(0, Math.round(v * (m.h - 1))))
    return m.data[(y * m.w + x) * 4] > 127
  }

  const regionFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const u = (e.clientX - rect.left) / rect.width
    const v = (e.clientY - rect.top) / rect.height
    if (!isLand(u, v)) return null
    return regions.find((r) => pointInPolygon(u, v, r.polygon))?.id ?? null
  }

  const enter3d = async () => {
    if (!webgl) {
      setMessage('Este dispositivo não oferece suporte a WebGL. O mapa 2D continua disponível com as mesmas regiões e informações.')
      return
    }
    setMessage(null)
    setMode('loading')
    stageRef.current?.scrollIntoView({ behavior: reducedMotion.current ? 'auto' : 'smooth', block: 'center' })
    try {
      const lowPower = isLowPowerDevice()
      lowPowerRef.current = lowPower
      // aguarda a ampliação da área do mapa antes de medir a cena
      await new Promise((r) => setTimeout(r, reducedMotion.current ? 0 : 420))
      const { createWorld3D } = await import('./world3d')
      if (!glHostRef.current || !labelHostRef.current) throw new Error('Área do mapa indisponível')
      const world = await createWorld3D({
        container: glHostRef.current,
        labelLayer: labelHostRef.current,
        heightmapUrl: heightmap.src,
        heightmapSize: [heightmap.width, heightmap.height],
        seaLevel: heightmap.seaLevel,
        aspect,
        textureUrl: optimized(images[version].src, lowPower ? 1200 : 2048),
        maskUrl: maskSrc,
        regions: regions3d,
        selectedId: selected,
        reducedMotion: reducedMotion.current,
        lowPower,
        labelText: { erased: ERASED_LABEL },
        onSelect: (id) => select(id),
        onHover: (id) => setHovered(id),
        onContextLost: () => {
          worldRef.current?.dispose()
          worldRef.current = null
          setMode('2d')
          setMessage('A visualização 3D foi interrompida pelo navegador (perda do contexto gráfico). O mapa 2D continua disponível; você pode tentar abrir o 3D novamente.')
        },
      })
      worldRef.current = world
      setMode('3d')
      await world.enter()
    } catch (error) {
      console.error(error)
      worldRef.current?.dispose()
      worldRef.current = null
      setMode('2d')
      setMessage('Não foi possível preparar a visualização 3D neste dispositivo. O mapa 2D continua disponível com as mesmas regiões.')
    }
  }

  const exit3d = async () => {
    const world = worldRef.current
    setMode('leaving')
    if (world) {
      await world.exit()
      world.dispose()
    }
    worldRef.current = null
    setMode('2d')
  }

  const onRegionKey = (id: string) => (e: KeyboardEvent<SVGPathElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(id)
    }
  }

  const in3d = mode !== '2d'
  const image = images[version]
  const panelVisible = !!active

  return (
    <section className="world-atlas" data-mode={mode} data-drawn={drawnLabels ? 'true' : undefined} aria-label="Mapa interativo do mundo">
      <div className="world-atlas__bar">
        <div className="segmented" role="group" aria-label="Versão do mapa">
          {(Object.keys(MAP_VERSIONS) as MapVersionId[]).map((id) => (
            <button key={id} type="button" aria-pressed={version === id} onClick={() => setVersion(id)}>
              <span className="segmented__label">{MAP_VERSIONS[id].label}</span>
              <span className="segmented__sub">{MAP_VERSIONS[id].sublabel}</span>
            </button>
          ))}
        </div>
        {in3d ? (
          <button type="button" className="btn" onClick={exit3d} disabled={mode !== '3d'}>
            Voltar ao mapa 2D
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={enter3d} aria-describedby="atlas-3d-desc">
            <ExpandIcon width={18} height={18} /> Explorar em 3D
          </button>
        )}
      </div>
      <p className="world-atlas__version-note" id="atlas-3d-desc">
        {MAP_VERSIONS[version].description}
      </p>

      <div className="world-atlas__viewport">
        <div
          ref={stageRef}
          className="world-atlas__stage"
          style={{ '--atlas-ratio': `${VB_W / VB_H}` } as CSSProperties}
        >
          <div
            className="world-atlas__map2d"
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse' || in3d) return
              const id = regionFromEvent(e)
              if (id !== hovered) setHovered(id)
            }}
            onPointerLeave={() => setHovered(null)}
            onClick={(e) => {
              if (in3d) return
              select(regionFromEvent(e as unknown as PointerEvent<HTMLDivElement>))
            }}
          >
            <Image src={image.src} alt={image.alt} width={image.width} height={image.height} sizes="(min-width: 1440px) 1440px, 100vw" priority className="world-atlas__image" />
            <svg className="world-atlas__overlay" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" aria-hidden={in3d}>
              <defs>
                <mask id="atlas-land" maskUnits="userSpaceOnUse" x="0" y="0" width={VB_W} height={VB_H}>
                  <image href={maskSrc} x="0" y="0" width={VB_W} height={VB_H} preserveAspectRatio="none" />
                </mask>
              </defs>
              <g mask="url(#atlas-land)">
                {regions.map((r) => {
                  const erasedHere = isErased(r.id)
                  return (
                    <path
                      key={r.id}
                      d={polygonPath(r.polygon, VB_W, VB_H)}
                      className={`atlas-region${erasedHere ? ' is-erased' : ''}${selected === r.id ? ' is-selected' : ''}${hovered === r.id ? ' is-hovered' : ''}`}
                      style={{ '--region-color': r.accent } as CSSProperties}
                      tabIndex={in3d ? -1 : 0}
                      role="button"
                      aria-label={erasedHere ? `${ERASED_LABEL} — região apagada da história oficial` : `${r.name} — zona conceitual`}
                      aria-pressed={selected === r.id}
                      onKeyDown={onRegionKey(r.id)}
                      onFocus={() => setHovered(r.id)}
                      onBlur={() => setHovered(null)}
                    />
                  )
                })}
              </g>
            </svg>
            <div className="world-atlas__labels" aria-hidden="true">
              {regions.map((r) => {
                const erasedHere = isErased(r.id)
                if (drawnLabels && !erasedHere) return null
                return (
                  <span
                    key={r.id}
                    className={`atlas-label${erasedHere ? ' is-erased' : ''}${selected === r.id ? ' is-selected' : ''}`}
                    style={{ left: `${r.label[0] * 100}%`, top: `${r.label[1] * 100}%` }}
                  >
                    {erasedHere ? ERASED_LABEL : r.name}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="world-atlas__gl" ref={glHostRef} />
          <div className="world-atlas__labels3d" ref={labelHostRef} />

          <p className="world-atlas__ribbon">{in3d ? 'Modo 3D · relevo interpretado da carta' : 'Carta do manuscrito · nomes e fronteiras sujeitos a revisão'}</p>
          {mode === 'loading' ? (
            <p className="world-atlas__loading" role="status">
              Preparando o relevo…
            </p>
          ) : null}
          {mode === '3d' ? (
            <>
              <div className="world-atlas__controls" role="toolbar" aria-label="Controles da câmera 3D">
                <button type="button" onClick={() => worldRef.current?.zoom(0.75)} aria-label="Aproximar">
                  <PlusIcon />
                </button>
                <button type="button" onClick={() => worldRef.current?.zoom(1.33)} aria-label="Afastar">
                  <MinusIcon />
                </button>
                <button type="button" onClick={() => worldRef.current?.rotate(-0.5)} aria-label="Girar para a esquerda">
                  <span aria-hidden="true">⟲</span>
                </button>
                <button type="button" onClick={() => worldRef.current?.rotate(0.5)} aria-label="Girar para a direita">
                  <span aria-hidden="true">⟳</span>
                </button>
                <button type="button" onClick={() => worldRef.current?.tilt(-0.15)} aria-label="Inclinar para cima">
                  <span aria-hidden="true">⤒</span>
                </button>
                <button type="button" onClick={() => worldRef.current?.tilt(0.15)} aria-label="Inclinar para baixo">
                  <span aria-hidden="true">⤓</span>
                </button>
                <button type="button" onClick={() => worldRef.current?.resetView()} aria-label="Reposicionar a câmera">
                  <ResetIcon />
                </button>
              </div>
              <p className="world-atlas__hint">Arraste para girar · pinça ou roda para aproximar · dois dedos para mover · toque em uma região</p>
            </>
          ) : null}
          {!in3d ? <p className="world-atlas__hint world-atlas__hint--2d">Toque ou clique em uma região · use “Explorar em 3D” para ver o relevo</p> : null}
        </div>

        {panelVisible && active ? (
          <aside
            className={`atlas-panel${in3d && !sheetOpen ? ' is-collapsed' : ''}`}
            id={panelId}
            aria-live="polite"
            aria-labelledby={`${panelId}-title`}
          >
            <div className="atlas-panel__head">
              <div>
                <p className="atlas-panel__kicker">{isErased(active.id) ? 'Versão oficial' : active.epithet || active.government || 'Reino'}</p>
                <h3 id={`${panelId}-title`}>{isErased(active.id) ? ERASED_LABEL : active.name}</h3>
              </div>
              <div className="atlas-panel__actions">
                {in3d ? (
                  <button type="button" className="atlas-panel__toggle" onClick={() => setSheetOpen((v) => !v)} aria-expanded={sheetOpen}>
                    {sheetOpen ? 'Recolher' : 'Expandir'}
                  </button>
                ) : null}
                <button type="button" className="atlas-panel__close" onClick={() => select(null)} aria-label="Fechar painel">
                  <CloseIcon width={18} height={18} />
                </button>
              </div>
            </div>
            <div className="atlas-panel__body">
              {isErased(active.id) ? (
                <>
                  <p>
                    Na versão oficial da história, esta região não pertence a nenhum reino reconhecido. O que existia aqui foi apagado depois da Noite das Cinzas.
                  </p>
                  <button type="button" className="btn btn--small" onClick={() => setVersion('original')}>
                    Ver no mundo original
                  </button>
                </>
              ) : (
                <>
                  {active.image ? (
                    <figure className="atlas-panel__figure">
                      <Image src={active.image.src} alt={active.image.alt} width={active.image.width} height={active.image.height} sizes="340px" />
                      {active.image.caption ? <figcaption>{active.image.caption}</figcaption> : null}
                    </figure>
                  ) : null}
                  <p>{active.summary}</p>
                  <p className="atlas-panel__status">
                    <span className={`badge badge--${active.canon}`}>
                      <span className="badge__mark" aria-hidden="true" />
                      {active.canonLabel}
                    </span>
                    <span className="badge badge--plain">Zona conceitual</span>
                  </p>
                  <p className="atlas-panel__note">A posição e os limites desta zona são provisórios e servem apenas à visualização.</p>
                  {active.href ? (
                    <Link className="btn btn--gold btn--small" href={active.href}>
                      Abrir o verbete do reino
                    </Link>
                  ) : (
                    <p className="atlas-panel__note">Esta região ainda está em desenvolvimento.</p>
                  )}
                </>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {message ? (
        <p className="notice notice--fire world-atlas__message" role="alert">
          <span>{message}</span>
          <button type="button" className="atlas-panel__close" onClick={() => setMessage(null)} aria-label="Fechar aviso">
            <CloseIcon width={16} height={16} />
          </button>
        </p>
      ) : null}

      <div className="world-atlas__legend">
        <nav aria-label="Regiões do mapa">
          <h3 className="eyebrow">Regiões</h3>
          <ul className="region-list">
            {regions.map((r) => {
              const erasedHere = isErased(r.id)
              return (
                <li key={r.id}>
                  <button type="button" aria-pressed={selected === r.id} onClick={() => select(r.id)} style={{ '--region-color': r.accent } as CSSProperties}>
                    <span className={`region-list__swatch${erasedHere ? ' is-erased' : ''}`} aria-hidden="true" />
                    <span className="region-list__name">{erasedHere ? ERASED_LABEL : r.name}</span>
                    <span className="region-list__meta">{erasedHere ? 'apagada da história oficial' : r.canonLabel.toLowerCase()}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div>
          <h3 className="eyebrow">Legenda</h3>
          <ul className="map-key">
            <li>
              <span className="map-key__zone" aria-hidden="true" /> Zona conceitual de um reino
            </li>
            <li>
              <span className="map-key__border" aria-hidden="true" /> Fronteira conceitual (não aprovada)
            </li>
            <li>
              <span className="map-key__erased" aria-hidden="true" /> Região apagada na versão oficial
            </li>
            <li>
              <span className="map-key__relief" aria-hidden="true" /> Relevo, rios e costas ilustrativos
            </li>
          </ul>
          {webgl === false ? <p className="atlas-panel__note">O modo 3D não está disponível neste dispositivo; o mapa 2D oferece as mesmas regiões.</p> : null}
        </div>
      </div>
    </section>
  )
}
