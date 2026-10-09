export const SITE_NAME = 'Kael Draken — Arquivo da Chama Antiga'
export const SITE_TITLE = 'Kael Draken — O Sussurro da Chama Antiga'

export function siteUrl(): URL {
  try {
    return new URL(process.env.SITE_URL || 'http://localhost:3000')
  } catch {
    return new URL('http://localhost:3000')
  }
}
