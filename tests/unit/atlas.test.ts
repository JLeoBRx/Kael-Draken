import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ART, ILLUSTRATION, artImage, emblemArt } from '@/lib/atlas/art'
import { SEED_ILLUSTRATIONS } from '@/lib/seed/content'
import { MAP_VERSIONS, pointInPolygon, regionAt, WORLD } from '@/lib/atlas/world'
import { normalizePair } from '@/lib/content/link-pairs'
import { slugify } from '@/lib/slug'

const publicFile = (src: string) => path.join(process.cwd(), 'public', src)

describe('dados cartográficos', () => {
  it('declara as seis regiões conceituais, uma por reino', () => {
    expect(WORLD.estado).toBe('conceitual')
    expect(WORLD.regioes.map((r) => r.reino).sort()).toEqual(['aurelion', 'elyndor', 'kharveth', 'nacaris', 'rhovaryn', 'safra'])
    for (const r of WORLD.regioes) {
      expect(r.estado).toBe('conceitual')
      expect(r.poligono.length).toBeGreaterThan(10)
    }
  })

  it('coloca cada rótulo dentro da própria região', () => {
    for (const r of WORLD.regioes) {
      const [u, v] = r.rotulo
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThanOrEqual(1)
      expect(pointInPolygon(u, v, r.poligono)).toBe(true)
      expect(regionAt(u, v, WORLD.regioes)).toBe(r.id)
    }
  })

  it('apaga Safra apenas na versão do mundo conhecido', () => {
    expect(MAP_VERSIONS.original.erased).toEqual([])
    expect(MAP_VERSIONS.conhecido.erased).toEqual(['safra'])
  })

  it('aponta para arquivos de relevo e máscara existentes', () => {
    expect(existsSync(publicFile(WORLD.relevo.arquivo))).toBe(true)
    expect(existsSync(publicFile(WORLD.mascaraTerra))).toBe(true)
    expect(WORLD.relevo.nivelDoMar).toBeGreaterThan(0)
    expect(WORLD.relevo.nivelDoMar).toBeLessThan(1)
  })
})

describe('registro de artes', () => {
  it('todas as imagens registradas existem e são identificadas', () => {
    const entries = [...Object.values(ART).filter((v) => 'src' in v), ...Object.values(ART.selo), ...Object.values(ART.reino)] as Array<{ src: string; alt: string; caption?: string; credit?: string }>
    expect(entries.length).toBe(17)
    for (const e of entries) {
      expect(existsSync(publicFile(e.src)), e.src).toBe(true)
      // a cena da capa é só fundo decorativo (alt vazio); as demais precisam de descrição
      if (e !== ART.cenaCapa) expect(e.alt.length, e.src).toBeGreaterThan(10)
      expect(e.caption).toBeTruthy()
      expect(e.credit).toBeTruthy()
    }
  })

  it('cada reino tem um detalhe da carta do manuscrito', () => {
    for (const slug of ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn']) {
      expect(ART.reino[slug]?.src).toBe(`/images/atlas/carta/${slug}.webp`)
      expect(artImage('kingdom', slug)).toBe(ART.reino[slug])
    }
  })

  it('as ilustrações aproveitadas nos verbetes são as dos capítulos do manuscrito', () => {
    const slugs = new Set(SEED_ILLUSTRATIONS.map((i) => i.slug))
    for (const ref of Object.values(ILLUSTRATION)) {
      expect(slugs.has(ref.illustration), ref.illustration).toBe(true)
      expect(existsSync(publicFile(`/images/livro-1/ilustracoes/${ref.illustration}.png`)), ref.illustration).toBe(true)
    }
    expect(artImage('character', 'kael-draken')).toBe(ILLUSTRATION.capitulo1)
    expect(artImage('location', 'brumafunda')).toBe(ILLUSTRATION.capitulo3)
  })

  it('há um brasão vetorial por reino', () => {
    for (const slug of ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn']) {
      const emblem = emblemArt(slug)
      expect(emblem && existsSync(publicFile(emblem.src))).toBe(true)
    }
    expect(emblemArt('inexistente')).toBeNull()
  })
})

describe('utilitários', () => {
  it('gera slugs em português', () => {
    expect(slugify('Safra e a Noite das Cinzas')).toBe('safra-e-a-noite-das-cinzas')
    expect(slugify('Nácaris — Confederação')).toBe('nacaris-confederacao')
  })

  it('normaliza pares de relações independentemente da ordem', () => {
    expect(normalizePair('event', 5, 'kingdom', 2)).toEqual(normalizePair('kingdom', 2, 'event', 5))
  })
})
