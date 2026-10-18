// Versão em HTML — Atlas interativo: carta 2D com regiões e modo 3D com relevo.
// Sem dependências: o 3D (assets/atlas3d.js) só é carregado quando pedido.
;(() => {
  const root = document.querySelector('[data-atlas]')
  const cfgEl = document.getElementById('atlas-config')
  if (!root || !cfgEl) return
  const cfg = JSON.parse(cfgEl.textContent || '{}')

  const $ = (sel) => root.querySelector(sel)
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const stage = $('.world-atlas__stage')
  const map2d = $('.world-atlas__map2d')
  const image = $('.world-atlas__image')
  const glHost = $('.world-atlas__gl')
  const labels3d = $('.world-atlas__labels3d')
  const erasedLabels = $('.world-atlas__labels')
  const ribbon = $('.world-atlas__ribbon')
  const loading = $('.world-atlas__loading')
  const controls = $('.world-atlas__controls')
  const hint3d = $('.world-atlas__hint--3d')
  const hint2d = $('.world-atlas__hint--2d')
  const note = $('.world-atlas__version-note')
  const btn3d = $('[data-atlas-enter]')
  const btn2d = $('[data-atlas-exit]')
  const panel = $('.atlas-panel')
  const message = $('.world-atlas__message')
  const paths = new Map([...root.querySelectorAll('.atlas-region')].map((p) => [p.dataset.region, p]))
  const items = new Map([...root.querySelectorAll('.region-list button')].map((b) => [b.dataset.region, b]))

  const state = { version: 'original', selected: null, hovered: null, mode: '2d', sheetOpen: true }
  let world = null
  let sources = null

  const erased = (id) => cfg.versions[state.version].erased.includes(id)
  const regionById = (id) => cfg.regions.find((r) => r.id === id) || null

  // ── Máscara de terra (para não selecionar o mar perto da costa) ────────
  let mask = null
  const maskImg = new Image()
  maskImg.onload = () => {
    try {
      const w = 600
      const h = Math.round(600 / cfg.aspect)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(maskImg, 0, 0, w, h)
      mask = { data: ctx.getImageData(0, 0, w, h).data, w, h }
    } catch {
      mask = null
    }
  }
  maskImg.src = cfg.mask

  const isLand = (u, v) => {
    if (!mask) return true
    const x = Math.min(mask.w - 1, Math.max(0, Math.round(u * (mask.w - 1))))
    const y = Math.min(mask.h - 1, Math.max(0, Math.round(v * (mask.h - 1))))
    return mask.data[(y * mask.w + x) * 4] > 127
  }

  const inside = (u, v, poly) => {
    let hit = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }

  const regionAt = (e) => {
    const rect = map2d.getBoundingClientRect()
    const u = (e.clientX - rect.left) / rect.width
    const v = (e.clientY - rect.top) / rect.height
    if (!isLand(u, v)) return null
    const r = cfg.regions.find((x) => inside(u, v, x.polygon))
    return r ? r.id : null
  }

  // ── Desenho do estado ─────────────────────────────────────────────────
  const in3d = () => state.mode !== '2d'

  // O painel só é redesenhado quando o que ele mostra muda (passar o mouse
  // sobre a carta não pode trocar o botão que está sob o cursor).
  let panelKey = ''
  function renderPanel() {
    const key = [state.selected, state.version, in3d(), state.sheetOpen].join('|')
    if (key === panelKey) return
    panelKey = key
    const r = regionById(state.selected)
    if (!r) {
      panel.hidden = true
      panel.innerHTML = ''
      return
    }
    const off = erased(r.id)
    const toggle = in3d()
      ? `<button type="button" class="atlas-panel__toggle" data-panel-toggle aria-expanded="${state.sheetOpen}">${state.sheetOpen ? 'Recolher' : 'Expandir'}</button>`
      : ''
    const head = `<div class="atlas-panel__head">
        <div>
          <p class="atlas-panel__kicker">${esc(off ? 'Versão oficial' : r.kicker)}</p>
          <h3 id="atlas-painel-titulo">${esc(off ? cfg.erasedLabel : r.name)}</h3>
        </div>
        <div class="atlas-panel__actions">${toggle}<button type="button" class="atlas-panel__close" data-panel-close aria-label="Fechar painel">×</button></div>
      </div>`
    const body = off
      ? `<p>Na versão oficial da história, esta região não pertence a nenhum reino reconhecido. O que existia aqui foi apagado depois da Noite das Cinzas.</p>
         <p><button type="button" class="btn btn--line btn--small" data-version="original">Ver no mundo original</button></p>`
      : `${r.image ? `<figure class="atlas-panel__figure"><img src="${r.image.src}" width="${r.image.width}" height="${r.image.height}" alt="${esc(r.image.alt)}"><figcaption>${esc(r.image.caption)}</figcaption></figure>` : ''}
         <p>${esc(r.summary)}</p>
         <p class="atlas-panel__status"><span class="badge badge--${esc(r.canon)}">${esc(r.canonLabel)}</span><span class="badge badge--plain">Zona conceitual</span></p>
         <p class="atlas-panel__note">A posição e os limites desta zona são provisórios e servem apenas à visualização.</p>
         <p><a class="btn btn--ember btn--small" href="${r.href}">Abrir o verbete do reino</a></p>`
    panel.innerHTML = `${head}<div class="atlas-panel__body">${body}</div>`
    panel.classList.toggle('is-collapsed', in3d() && !state.sheetOpen)
    panel.hidden = false
  }

  function render() {
    const v = cfg.versions[state.version]
    root.dataset.mode = state.mode
    root.querySelectorAll('[data-version-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.versionBtn === state.version)))
    note.textContent = v.description
    if (image.getAttribute('src') !== v.src) {
      image.src = v.src
      image.alt = v.alt
    }
    for (const [id, p] of paths) {
      const r = regionById(id)
      const off = erased(id)
      p.classList.toggle('is-erased', off)
      p.classList.toggle('is-selected', state.selected === id)
      p.classList.toggle('is-hovered', state.hovered === id)
      p.setAttribute('aria-pressed', String(state.selected === id))
      p.setAttribute('aria-label', off ? `${cfg.erasedLabel} — região apagada da história oficial` : `${r.name} — zona conceitual`)
      p.setAttribute('tabindex', in3d() ? '-1' : '0')
    }
    erasedLabels.innerHTML = cfg.regions
      .filter((r) => erased(r.id))
      .map((r) => `<span class="atlas-label is-erased${state.selected === r.id ? ' is-selected' : ''}" style="left:${r.label[0] * 100}%;top:${r.label[1] * 100}%">${esc(cfg.erasedLabel)}</span>`)
      .join('')
    for (const [id, b] of items) {
      const r = regionById(id)
      const off = erased(id)
      b.setAttribute('aria-pressed', String(state.selected === id))
      b.querySelector('.region-list__swatch').classList.toggle('is-erased', off)
      b.querySelector('.region-list__name').textContent = off ? cfg.erasedLabel : r.name
      b.querySelector('.region-list__meta').textContent = off ? 'apagada da história oficial' : r.canonLabel.toLowerCase()
    }
    btn3d.hidden = in3d()
    btn2d.hidden = !in3d()
    btn2d.disabled = state.mode !== '3d'
    loading.hidden = state.mode !== 'loading'
    controls.hidden = state.mode !== '3d'
    hint3d.hidden = state.mode !== '3d'
    hint2d.hidden = in3d()
    ribbon.textContent = in3d() ? 'Modo 3D · relevo interpretado da carta' : 'Carta do manuscrito · nomes e fronteiras sujeitos a revisão'
    renderPanel()
  }

  function select(id) {
    state.selected = id && regionById(id) ? id : null
    state.sheetOpen = true
    render()
    if (world) world.setSelected(state.selected)
  }

  function setVersion(id) {
    if (!cfg.versions[id] || id === state.version) return
    state.version = id
    render()
    if (world && sources) void world.setVersion(sources[id], regions3d())
  }

  const showMessage = (text) => {
    message.querySelector('span').textContent = text
    message.hidden = false
  }

  const regions3d = () => cfg.regions.map((r) => ({ id: r.id, name: r.name, accent: r.accent, polygon: r.polygon, label: r.label, erased: erased(r.id) }))

  // ── Interações 2D ─────────────────────────────────────────────────────
  map2d.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || in3d()) return
    const id = regionAt(e)
    if (id !== state.hovered) {
      state.hovered = id
      render()
    }
  })
  map2d.addEventListener('pointerleave', () => {
    if (state.hovered) {
      state.hovered = null
      render()
    }
  })
  map2d.addEventListener('click', (e) => {
    if (!in3d()) select(regionAt(e))
  })
  for (const [id, p] of paths) {
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        select(id)
      }
    })
    p.addEventListener('focus', () => {
      state.hovered = id
      render()
    })
    p.addEventListener('blur', () => {
      state.hovered = null
      render()
    })
  }
  for (const [id, b] of items) b.addEventListener('click', () => select(id))
  root.querySelectorAll('[data-version-btn]').forEach((b) => b.addEventListener('click', () => setVersion(b.dataset.versionBtn)))

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-panel-close]')) select(null)
    else if (e.target.closest('[data-panel-toggle]')) {
      state.sheetOpen = !state.sheetOpen
      renderPanel()
    } else if (e.target.closest('[data-version]')) setVersion(e.target.closest('[data-version]').dataset.version)
  })
  message.querySelector('button').addEventListener('click', () => (message.hidden = true))

  // ── Modo 3D ───────────────────────────────────────────────────────────
  const webglAvailable = () => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return false
    }
  }

  const isLowPower = () => {
    const cores = navigator.hardwareConcurrency || 4
    const memory = navigator.deviceMemory || 4
    const smallTouch = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600
    return cores <= 4 || memory <= 4 || smallTouch
  }

  const scripts = new Map()
  const loadScript = (src) => {
    if (!scripts.has(src))
      scripts.set(
        src,
        new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = src
          s.onload = resolve
          s.onerror = () => reject(new Error(`Falha ao carregar ${src}`))
          document.head.appendChild(s)
        }),
      )
    return scripts.get(src)
  }

  // Abertas do disco (file://), as imagens não podem ser lidas pelo WebGL:
  // nesse caso a carta e o relevo vêm embutidos em assets/atlas-dados.js.
  const resolveSources = async (embedded) => {
    if (embedded || location.protocol === 'file:') {
      await loadScript(cfg.embedded)
      return window.KAEL_ATLAS_DADOS
    }
    return { original: cfg.versions.original.texture, conhecido: cfg.versions.conhecido.texture, relevo: cfg.heightmap.src }
  }

  const createWorld = async (src) => {
    const lowPower = isLowPower()
    return window.KaelAtlas3D.createWorld3D({
      container: glHost,
      labelLayer: labels3d,
      heightmapUrl: src.relevo,
      heightmapSize: [cfg.heightmap.width, cfg.heightmap.height],
      seaLevel: cfg.heightmap.seaLevel,
      aspect: cfg.aspect,
      textureUrl: src[state.version],
      maskUrl: cfg.mask,
      regions: regions3d(),
      selectedId: state.selected,
      reducedMotion: reduced,
      lowPower,
      labelText: { erased: cfg.erasedLabel },
      compactLabels: true,
      onSelect: (id) => select(id),
      onHover: () => {},
      onContextLost: () => {
        if (world) world.dispose()
        world = null
        state.mode = '2d'
        render()
        showMessage('A visualização 3D foi interrompida pelo navegador (perda do contexto gráfico). O mapa 2D continua disponível; você pode tentar abrir o 3D novamente.')
      },
    })
  }

  async function enter3d() {
    if (!webglAvailable()) {
      showMessage('Este dispositivo não oferece suporte a WebGL. O mapa 2D continua disponível com as mesmas regiões e informações.')
      return
    }
    message.hidden = true
    state.mode = 'loading'
    render()
    stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    try {
      await new Promise((r) => setTimeout(r, reduced ? 0 : 420))
      await loadScript(cfg.bundle)
      sources = await resolveSources(false)
      try {
        world = await createWorld(sources)
      } catch (err) {
        // imagens bloqueadas para leitura (origem diferente): tenta de novo com as embutidas
        if (!(err && err.name === 'SecurityError')) throw err
        glHost.replaceChildren()
        sources = await resolveSources(true)
        world = await createWorld(sources)
      }
      state.mode = '3d'
      render()
      await world.enter()
    } catch (err) {
      console.error(err)
      if (world) world.dispose()
      world = null
      state.mode = '2d'
      render()
      showMessage('Não foi possível preparar a visualização 3D neste dispositivo. O mapa 2D continua disponível com as mesmas regiões.')
    }
  }

  async function exit3d() {
    state.mode = 'leaving'
    render()
    if (world) {
      await world.exit()
      world.dispose()
    }
    world = null
    state.mode = '2d'
    render()
  }

  btn3d.addEventListener('click', () => void enter3d())
  btn2d.addEventListener('click', () => void exit3d())
  controls.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b || !world) return
    const act = b.dataset.cam
    if (act === 'zoom-in') world.zoom(0.75)
    else if (act === 'zoom-out') world.zoom(1.33)
    else if (act === 'left') world.rotate(-0.5)
    else if (act === 'right') world.rotate(0.5)
    else if (act === 'up') world.tilt(-0.15)
    else if (act === 'down') world.tilt(0.15)
    else if (act === 'reset') world.resetView()
  })

  // Endereço com #regiao-… (links dos verbetes dos reinos)
  const fromHash = () => {
    const m = /^#regiao-([a-z0-9-]+)$/.exec(location.hash)
    if (!m || !regionById(m[1])) return
    select(m[1])
    stage.scrollIntoView({ behavior: 'auto', block: 'center' })
  }
  window.addEventListener('hashchange', fromHash)

  if (!webglAvailable()) {
    btn3d.disabled = true
    root.querySelector('.world-atlas__no3d').hidden = false
  }
  render()
  fromHash()
})()
