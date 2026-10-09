import 'server-only'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { imageSize } from 'image-size'

/** Formatos aceitos e o tipo MIME correspondente. SVG é recusado por poder conter scripts. */
export const ACCEPTED_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

export function uploadsDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR?.trim() || './data/uploads')
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB || 25)
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024
}

/** Resolve um caminho relativo dentro da pasta de uploads, recusando travessia de diretórios. */
export function resolveUploadPath(relative: string): string | null {
  const base = uploadsDir()
  const full = path.resolve(/*turbopackIgnore: true*/ base, relative)
  if (full !== base && full.startsWith(base + path.sep)) return full
  return null
}

export interface StoredFile {
  path: string
  mime: string
  width: number
  height: number
  size: number
  originalName: string
}

export class UploadError extends Error {}

/** Valida o conteúdo real do arquivo (não apenas a extensão) e grava no disco. */
export async function storeUpload(file: File): Promise<StoredFile> {
  if (!file || file.size === 0) throw new UploadError('Arquivo vazio.')
  if (file.size > maxUploadBytes()) throw new UploadError(`Arquivo maior que o limite de ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`)
  const buffer = Buffer.from(await file.arrayBuffer())

  let info: { width?: number; height?: number; type?: string }
  try {
    info = imageSize(buffer)
  } catch {
    throw new UploadError('O arquivo não é uma imagem reconhecida.')
  }
  const ext = info.type === 'jpeg' ? 'jpg' : (info.type ?? '')
  const mime = ACCEPTED_TYPES[ext]
  if (!mime) throw new UploadError('Formato não aceito. Use JPG, PNG, WebP, AVIF ou GIF.')

  const now = new Date()
  const folder = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const relative = `${folder}/${randomUUID()}.${ext}`
  const full = resolveUploadPath(relative)
  if (!full) throw new UploadError('Caminho de upload inválido.')
  await mkdir(path.dirname(/*turbopackIgnore: true*/ full), { recursive: true })
  await writeFile(/*turbopackIgnore: true*/ full, buffer)

  return {
    path: relative,
    mime,
    width: info.width ?? 0,
    height: info.height ?? 0,
    size: buffer.length,
    originalName: file.name.slice(0, 200),
  }
}

export async function readUpload(relative: string): Promise<Buffer | null> {
  const full = resolveUploadPath(relative)
  if (!full) return null
  try {
    return await readFile(/*turbopackIgnore: true*/ full)
  } catch {
    return null
  }
}

export async function removeUpload(relative: string) {
  const full = resolveUploadPath(relative)
  if (!full) return
  await unlink(/*turbopackIgnore: true*/ full).catch(() => {})
}
