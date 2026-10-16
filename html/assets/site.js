// Versão em HTML do Arquivo da Chama Antiga — interações da página (sem dependências).
;(() => {
  const dialog = document.getElementById('viewer')
  const dataEl = document.getElementById('ilustracoes-dados')
  const items = dataEl ? JSON.parse(dataEl.textContent || '[]') : []

  if (dialog) {
    const img = document.getElementById('viewer-img')
    const nav = document.getElementById('viewer-nav')
    const alt = dialog.querySelector('.viewer__alt')
    let current = -1
    let opener = null

    const set = (id, text) => {
      const el = document.getElementById(id)
      el.textContent = text
      el.hidden = !text
    }

    const show = (i) => {
      current = (i + items.length) % items.length
      const it = items[current]
      img.src = it.src
      img.width = it.w
      img.height = it.h
      img.alt = it.alt
      set('viewer-label', it.label + ' · ' + (current + 1) + ' de ' + items.length)
      set('viewer-title', it.title)
      set('viewer-state', it.state)
      set('viewer-caption', it.caption)
      document.getElementById('viewer-alt').textContent = it.alt
      nav.hidden = items.length < 2
      alt.hidden = false
      if (history.replaceState) history.replaceState(null, '', '#' + it.slug)
    }

    const open = (fn, from) => {
      opener = from || document.activeElement
      fn()
      if (!dialog.open) dialog.showModal()
    }

    document.querySelectorAll('[data-plate]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = items.findIndex((it) => it.slug === b.dataset.plate)
        if (i >= 0) open(() => show(i), b)
      }),
    )

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close()
      const step = e.target.closest('[data-step]')
      if (step && current >= 0) show(current + Number(step.dataset.step))
    })
    dialog.addEventListener('keydown', (e) => {
      if (current < 0) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        show(current + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        show(current - 1)
      }
    })
    let touch = null
    dialog.addEventListener('touchstart', (e) => (touch = e.touches[0]), { passive: true })
    dialog.addEventListener('touchend', (e) => {
      if (!touch || current < 0) return
      const dx = e.changedTouches[0].clientX - touch.clientX
      const dy = e.changedTouches[0].clientY - touch.clientY
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1))
      touch = null
    })
    dialog.addEventListener('close', () => {
      const wasPlate = current >= 0
      current = -1
      img.removeAttribute('src')
      if (wasPlate && history.replaceState) history.replaceState(null, '', location.pathname + location.search)
      if (opener && opener.focus) opener.focus({ preventScroll: true })
    })

    // Endereço com #capitulo-…: abre a ilustração (links das páginas de verbete e compartilhamento)
    const fromHash = () => {
      const slug = decodeURIComponent(location.hash.slice(1))
      const i = items.findIndex((it) => it.slug === slug)
      if (i >= 0) open(() => show(i), document.getElementById(slug))
    }
    if (location.hash) fromHash()

    // Carta: alternância entre as versões e visualização ampliada
    const map = document.getElementById('mapa')
    if (map) {
      let version = 'original'
      document.querySelectorAll('.atlas__opt').forEach((b) =>
        b.addEventListener('click', () => {
          version = b.dataset.map
          document.querySelectorAll('.atlas__opt').forEach((o) => o.setAttribute('aria-pressed', String(o === b)))
          map.src = map.dataset[version]
        }),
      )
      const zoom = document.querySelector('.atlas__map')
      if (zoom)
        zoom.addEventListener('click', (e) =>
          open(() => {
            current = -1
            img.src = map.src
            img.width = map.width
            img.height = map.height
            img.alt = map.alt
            set('viewer-label', 'Atlas dos Seis Reinos')
            set('viewer-title', version === 'original' ? 'Mundo original' : 'Mundo conhecido')
            set('viewer-state', '')
            set('viewer-caption', version === 'original' ? 'Os seis reinos, antes da Noite das Cinzas.' : 'A versão oficial: Safra apagada, cinco reinos.')
            nav.hidden = true
            alt.hidden = true
          }, e.currentTarget),
        )
    }
  }

  // Menu do celular: fecha ao escolher uma seção
  document.querySelectorAll('.mast__menu a').forEach((a) => a.addEventListener('click', () => a.closest('details').removeAttribute('open')))
})()
