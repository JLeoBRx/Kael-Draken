'use server'

import { and, eq, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyPassword } from '@/lib/auth/password'
import { clearAttempts, isRateLimited, registerFailedAttempt } from '@/lib/auth/rate-limit'
import { endAdminSession, getAdminConfigStatus, requireAdmin, startAdminSession } from '@/lib/auth/session'
import { isCollectionKey, type CollectionKey } from '@/lib/admin/collections'
import { deleteRow, saveRow, setRowStatus, type SaveResult } from '@/lib/admin/data'
import { db, schema as s } from '@/lib/db'
import { PUBLICATION_STATES, SPOILER_LEVELS, VOCABULARIES, type Vocabulary } from '@/lib/editorial'
import { renderMarkdown } from '@/lib/markdown/render'
import { removeUpload, storeUpload, UploadError } from '@/lib/media/storage'
import { SLUG_PATTERN, slugify } from '@/lib/slug'

// ── Sessão ────────────────────────────────────────────────────────────

export interface FormState {
  error?: string
  message?: string
}

export interface LoginState {
  error?: string
  username?: string
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const config = getAdminConfigStatus()
  if (!config.configured) return { error: 'O painel ainda não foi configurado. Veja as variáveis de ambiente no README.' }
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local'
  const username = String(form.get('username') ?? '').trim()
  if (isRateLimited(ip)) return { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', username }

  const password = String(form.get('password') ?? '')
  const validUser = username === process.env.ADMIN_USERNAME?.trim()
  const validPassword = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH ?? '')
  if (!validUser || !validPassword) {
    registerFailedAttempt(ip)
    return { error: 'Usuário ou senha incorretos.', username }
  }
  clearAttempts(ip)
  await startAdminSession(username)
  const next = String(form.get('next') ?? '')
  redirect(next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin')
}

export async function logoutAction() {
  await endAdminSession()
  redirect('/admin/login')
}

// ── Conteúdo ──────────────────────────────────────────────────────────

/** Atualiza as telas do painel e do site após uma alteração. */
function refresh() {
  revalidatePath('/', 'layout')
}

function assertCollection(key: string): CollectionKey {
  if (!isCollectionKey(key)) throw new Error('Coleção inválida')
  return key
}

export async function saveEntityAction(key: string, id: number | null, _prev: SaveResult, form: FormData): Promise<SaveResult> {
  await requireAdmin()
  const collection = assertCollection(key)
  const result = await saveRow(collection, id, form)
  if (result.ok) refresh()
  if (result.ok && !id && result.id) redirect(`/admin/${collection}/${result.id}?criado=1`)
  return result
}

export async function deleteEntityAction(key: string, id: number) {
  await requireAdmin()
  const collection = assertCollection(key)
  await deleteRow(collection, id)
  refresh()
  redirect(`/admin/${collection}?excluido=1`)
}

export async function statusAction(key: string, id: number, status: string) {
  await requireAdmin()
  const collection = assertCollection(key)
  if (!(PUBLICATION_STATES as readonly string[]).includes(status)) throw new Error('Estado inválido')
  await setRowStatus(collection, id, status as 'rascunho' | 'publicado' | 'arquivado')
  refresh()
}

/** Pré-visualização do Markdown no editor (mostra notas privadas e todos os spoilers). */
export async function previewMarkdownAction(source: string): Promise<string> {
  await requireAdmin()
  return renderMarkdown(source.slice(0, 200_000), { spoiler: 2, preview: true }).html
}

// ── Mídia ─────────────────────────────────────────────────────────────

export interface UploadState {
  message?: string
  errors?: string[]
  uploaded?: number[]
}

export async function uploadMediaAction(_prev: UploadState, form: FormData): Promise<UploadState> {
  await requireAdmin()
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (!files.length) return { errors: ['Selecione ao menos uma imagem.'] }
  const errors: string[] = []
  const uploaded: number[] = []
  const alt = String(form.get('alt') ?? '').trim()
  for (const file of files) {
    try {
      const stored = await storeUpload(file)
      const [row] = await db
        .insert(s.media)
        .values({ ...stored, alt: alt || file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ') })
        .returning({ id: s.media.id })
      uploaded.push(row.id)
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof UploadError ? error.message : 'falha ao gravar o arquivo.'}`)
    }
  }
  refresh()
  return { uploaded, errors, message: uploaded.length ? `${uploaded.length} imagem(ns) enviada(s).` : undefined }
}

export async function updateMediaAction(form: FormData) {
  await requireAdmin()
  const id = Number(form.get('id'))
  await db
    .update(s.media)
    .set({ alt: String(form.get('alt') ?? '').slice(0, 500), caption: String(form.get('caption') ?? '').slice(0, 1000), credit: String(form.get('credit') ?? '').slice(0, 300) })
    .where(eq(s.media.id, id))
  refresh()
}

/** Lugares em que uma imagem é usada (impede a exclusão de imagens em uso). */
async function mediaUsage(id: number): Promise<string[]> {
  const uses: string[] = []
  const check = async (label: string, rows: Promise<unknown[]>) => {
    if ((await rows).length) uses.push(label)
  }
  await check('reinos', db.select({ id: s.kingdoms.id }).from(s.kingdoms).where(or(eq(s.kingdoms.emblemId, id), eq(s.kingdoms.imageId, id))))
  await check('locais', db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.imageId, id)))
  await check('personagens', db.select({ id: s.characters.id }).from(s.characters).where(eq(s.characters.portraitId, id)))
  await check('verbetes', db.select({ id: s.articles.id }).from(s.articles).where(eq(s.articles.imageId, id)))
  await check('manuscritos', db.select({ id: s.documents.id }).from(s.documents).where(eq(s.documents.imageId, id)))
  await check('mapas', db.select({ id: s.maps.id }).from(s.maps).where(eq(s.maps.imageId, id)))
  await check('livros', db.select({ id: s.books.id }).from(s.books).where(eq(s.books.coverId, id)))
  await check('publicações', db.select({ id: s.posts.id }).from(s.posts).where(eq(s.posts.imageId, id)))
  await check('ilustrações', db.select({ id: s.illustrations.id }).from(s.illustrations).where(eq(s.illustrations.imageId, id)))
  await check('galerias', db.select({ id: s.mediaLinks.id }).from(s.mediaLinks).where(eq(s.mediaLinks.mediaId, id)))
  await check('capa oficial', db.select().from(s.settings).where(and(eq(s.settings.key, 'cover_media_id'), eq(s.settings.value, String(id)))))
  return uses
}

export async function deleteMediaAction(id: number): Promise<{ error?: string }> {
  await requireAdmin()
  const uses = await mediaUsage(id)
  if (uses.length) return { error: `A imagem está em uso em: ${uses.join(', ')}. Remova-a desses lugares antes de excluir.` }
  const [row] = await db.select().from(s.media).where(eq(s.media.id, id))
  if (!row) return {}
  await db.delete(s.media).where(eq(s.media.id, id))
  await removeUpload(row.path)
  refresh()
  return {}
}

// ── Configurações ─────────────────────────────────────────────────────

const SETTING_KEYS = ['home_intro', 'home_quote', 'home_quote_source', 'home_quote_href', 'site_description', 'author_name', 'cover_media_id'] as const

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const href = String(form.get('home_quote_href') ?? '').trim()
  if (href && !href.startsWith('/')) return { error: 'O link da citação precisa ser um endereço interno começando com /.' }
  for (const key of SETTING_KEYS) {
    const value = String(form.get(key) ?? '').trim()
    await db.insert(s.settings).values({ key, value }).onConflictDoUpdate({ target: s.settings.key, set: { value } })
  }
  refresh()
  return { message: 'Configurações salvas.' }
}

// ── Categorias e tags ─────────────────────────────────────────────────

export async function saveTermAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const vocabulary = String(form.get('vocabulary') ?? '') as Vocabulary
  if (!(vocabulary in VOCABULARIES)) return { error: 'Vocabulário inválido.' }
  const id = Number(form.get('id') ?? 0)
  const label = String(form.get('label') ?? '').trim()
  if (!label) return { error: 'Informe o nome.' }
  const slug = String(form.get('slug') ?? '').trim() || slugify(label)
  if (!SLUG_PATTERN.test(slug)) return { error: 'Identificador inválido.' }
  const sortOrder = Number(form.get('sortOrder') ?? 0) || 0
  const duplicate = await db
    .select()
    .from(s.terms)
    .where(and(eq(s.terms.vocabulary, vocabulary), eq(s.terms.slug, slug)))
  if (duplicate.some((d) => d.id !== id)) return { error: 'Já existe um termo com este identificador.' }
  if (id) await db.update(s.terms).set({ label, slug, sortOrder }).where(eq(s.terms.id, id))
  else await db.insert(s.terms).values({ vocabulary, label, slug, sortOrder })
  refresh()
  return { message: id ? 'Termo atualizado.' : 'Termo criado.' }
}

export async function deleteTermAction(id: number) {
  await requireAdmin()
  await db.delete(s.entityTags).where(eq(s.entityTags.termId, id))
  await db.delete(s.terms).where(eq(s.terms.id, id))
  refresh()
}

// ── Marcadores de mapa ────────────────────────────────────────────────

export async function saveMarkerAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const mapId = Number(form.get('mapId'))
  const id = Number(form.get('id') ?? 0)
  const label = String(form.get('label') ?? '').trim()
  const x = Number(form.get('x'))
  const y = Number(form.get('y'))
  if (!label) return { error: 'Informe o nome do marcador.' }
  if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) return { error: 'Clique no mapa ou informe posições entre 0 e 100.' }
  const spoiler = Number(form.get('spoiler') ?? 0)
  const status = String(form.get('status') ?? 'rascunho')
  const values = {
    mapId,
    label,
    x,
    y,
    markerType: String(form.get('markerType') ?? 'cidade') || 'cidade',
    description: String(form.get('description') ?? ''),
    locationId: Number(form.get('locationId')) || null,
    kingdomId: Number(form.get('kingdomId')) || null,
    provisional: form.get('provisional') === 'on',
    spoiler: (SPOILER_LEVELS as readonly number[]).includes(spoiler) ? spoiler : 0,
    status: (PUBLICATION_STATES as readonly string[]).includes(status) ? (status as 'rascunho') : 'rascunho',
  }
  if (id) await db.update(s.mapMarkers).set(values).where(eq(s.mapMarkers.id, id))
  else await db.insert(s.mapMarkers).values(values)
  refresh()
  return { message: id ? 'Marcador atualizado.' : 'Marcador criado.' }
}

export async function deleteMarkerAction(id: number) {
  await requireAdmin()
  await db.delete(s.mapMarkers).where(eq(s.mapMarkers.id, id))
  refresh()
}

// ── Relações entre personagens ────────────────────────────────────────

export async function saveRelationAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin()
  const characterId = Number(form.get('characterId'))
  const relatedId = Number(form.get('relatedId'))
  if (!relatedId || relatedId === characterId) return { error: 'Escolha outro personagem.' }
  const spoiler = Number(form.get('spoiler') ?? 0)
  const status = String(form.get('status') ?? 'publicado')
  await db.insert(s.characterRelations).values({
    characterId,
    relatedId,
    kind: String(form.get('kind') ?? ''),
    description: String(form.get('description') ?? ''),
    spoiler: (SPOILER_LEVELS as readonly number[]).includes(spoiler) ? spoiler : 0,
    status: (PUBLICATION_STATES as readonly string[]).includes(status) ? (status as 'publicado') : 'publicado',
  })
  refresh()
  return { message: 'Relação adicionada.' }
}

export async function deleteRelationAction(id: number) {
  await requireAdmin()
  await db.delete(s.characterRelations).where(eq(s.characterRelations.id, id))
  refresh()
}
