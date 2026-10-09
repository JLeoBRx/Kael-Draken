import { expect, test } from '@playwright/test'

test('mapa 2D: seleção de região e versões original/conhecida', async ({ page }) => {
  await page.goto('/atlas')
  const atlas = page.locator('.world-atlas')
  await expect(atlas).toHaveAttribute('data-mode', '2d')
  await expect(page.locator('.atlas-label', { hasText: 'Safra' })).toBeVisible()

  await page.locator('.region-list').getByRole('button', { name: /Nácaris/ }).click()
  await expect(page.locator('.atlas-panel h3')).toHaveText('Nácaris')
  await expect(page.locator('.atlas-panel')).toContainText('Zona conceitual')
  await expect(page).toHaveURL(/regiao=nacaris/)

  await page.getByRole('button', { name: /Mundo conhecido/ }).click()
  await expect(page.locator('.atlas-label.is-erased')).toHaveText('Terras sem registro')
  await page.locator('.region-list').getByRole('button', { name: /Terras sem registro/ }).click()
  await expect(page.locator('.atlas-panel')).toContainText('apagado depois da Noite das Cinzas')
  await page.getByRole('button', { name: 'Ver no mundo original' }).click()
  await expect(page.getByRole('button', { name: /Mundo original/ })).toHaveAttribute('aria-pressed', 'true')
})

test('mapa 2D: clique direto na carta seleciona a região sob o cursor', async ({ page }) => {
  await page.goto('/atlas')
  const map = page.locator('.world-atlas__map2d')
  const box = (await map.boundingBox())!
  // rótulo de Rhovaryn (u≈0.443, v≈0.76) — ponto garantidamente sobre a terra da região
  await map.click({ position: { x: box.width * 0.443, y: box.height * 0.76 } })
  await expect(page.locator('.atlas-panel h3')).toHaveText('Rhovaryn')
})

test('modo 3D: transição real, câmera, seleção e retorno ao 2D', async ({ page }) => {
  await page.goto('/atlas?regiao=aurelion')
  await page.getByRole('button', { name: 'Explorar em 3D' }).click()
  const canvas = page.locator('.world3d__canvas')
  await expect(canvas).toHaveClass(/is-visible/, { timeout: 45_000 })
  await expect(page.locator('.world-atlas')).toHaveAttribute('data-mode', '3d')
  await expect(page.locator('.world-atlas__ribbon')).toContainText('Modo 3D')
  await expect(page.locator('.world3d__label', { hasText: 'Kharveth' })).toBeAttached()
  await expect(page.locator('.atlas-panel h3')).toHaveText('Aurelion')

  // controles da câmera
  for (const name of ['Aproximar', 'Afastar', 'Girar para a esquerda', 'Girar para a direita', 'Reposicionar a câmera']) {
    await page.getByRole('button', { name }).click()
  }

  // espera o fim da animação de reposicionamento antes de usar os rótulos
  await page.waitForTimeout(1500)
  const label = page.locator('.world3d__label', { hasText: 'Kharveth' })
  await expect(label).toBeVisible()
  await label.click()
  await expect(page.locator('.atlas-panel h3')).toHaveText('Kharveth')

  // a cena renderizada não é vazia: a captura do canvas tem variação de cor
  const shot = await canvas.screenshot()
  const sharp = (await import('sharp')).default
  const { data, info } = await sharp(shot).resize(64, 40, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  const colors = new Set<number>()
  for (let i = 0; i < data.length; i += info.channels) colors.add((data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4))
  expect(colors.size).toBeGreaterThan(20)

  await page.getByRole('button', { name: 'Voltar ao mapa 2D' }).click()
  await expect(page.locator('.world-atlas')).toHaveAttribute('data-mode', '2d', { timeout: 20_000 })
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('.atlas-panel h3')).toHaveText('Kharveth')
})

test('modo 3D por toque: um dedo gira a câmera e a pinça aproxima', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'gestos multitoque verificados no perfil móvel')
  await page.goto('/atlas')
  await page.getByRole('button', { name: 'Explorar em 3D' }).click()
  const canvas = page.locator('.world3d__canvas')
  await expect(canvas).toHaveClass(/is-visible/, { timeout: 45_000 })
  await page.waitForTimeout(2500)

  const camera = async () => {
    const [distance, azimuth] = await Promise.all([canvas.getAttribute('data-distance'), canvas.getAttribute('data-azimuth')])
    return { distance: Number(distance), azimuth: Number(azimuth) }
  }

  const box = (await canvas.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const touch = (type: string, points: Array<[number, number]>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) } as never)

  // um dedo: arrastar horizontalmente gira a câmera em torno do mapa
  const before = await camera()
  // os gestos precisam começar sobre o terreno, não sobre um rótulo de região
  const [cx, cy] = await page.evaluate(
    ({ x, y, w, h }) => {
      const free = (px: number, py: number) => document.elementFromPoint(px, py)?.classList.contains('world3d__canvas')
      for (let fy = 0.3; fy <= 0.75; fy += 0.025)
        for (let fx = 0.35; fx <= 0.65; fx += 0.025) {
          const px = x + w * fx
          const py = y + h * fy
          if (free(px, py) && free(px - 30, py) && free(px + 30, py)) return [px, py]
        }
      return [x + w / 2, y + h / 2]
    },
    { x: box.x, y: box.y, w: box.width, h: box.height },
  )
  await touch('touchStart', [[cx, cy]])
  for (let i = 1; i <= 12; i++) await touch('touchMove', [[cx + i * 10, cy]])
  await touch('touchEnd', [])
  await page.waitForTimeout(1200)
  const rotated = await camera()
  expect(Math.abs(rotated.azimuth - before.azimuth)).toBeGreaterThan(0.1)

  // dois dedos: afastá-los aproxima a câmera
  await touch('touchStart', [
    [cx - 30, cy],
    [cx + 30, cy],
  ])
  for (let i = 1; i <= 12; i++)
    await touch('touchMove', [
      [cx - 30 - i * 6, cy],
      [cx + 30 + i * 6, cy],
    ])
  await touch('touchEnd', [])
  await page.waitForTimeout(1200)
  const zoomed = await camera()
  expect(zoomed.distance).toBeLessThan(rotated.distance * 0.85)
  expect(zoomed.distance).toBeGreaterThanOrEqual(3.5)

  // um toque curto sobre um rótulo continua selecionando a região
  await page.getByRole('button', { name: 'Reposicionar a câmera' }).click()
  await page.waitForTimeout(1500)
  const label = page.locator('.world3d__label', { hasText: 'Elyndor' })
  await expect(label).toBeVisible()
  await label.tap()
  await expect(page.locator('.atlas-panel h3')).toHaveText('Elyndor')

  await page.getByRole('button', { name: 'Voltar ao mapa 2D' }).click()
  await expect(page.locator('.world-atlas')).toHaveAttribute('data-mode', '2d', { timeout: 20_000 })
})
