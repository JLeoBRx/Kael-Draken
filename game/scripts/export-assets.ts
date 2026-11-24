/**
 * Gera os assets "de arte" a partir do código: hoje, o personagem com
 * esqueleto, materiais por nome e clipes de animação, em GLB.
 *
 *   npm run assets
 *
 * O jogo carrega public/arte/personagens/personagem.glb (GLTFLoader). Um
 * personagem feito por artista entra no lugar deste arquivo seguindo as
 * convenções de src/client/character/rig.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGeneratedTemplate } from '../src/client/character/character-assets'
import { writeCharacterGlb } from '../src/client/character/glb-writer'
import { buildClips } from '../src/client/character/rig'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'public/arte/personagens/personagem.glb')
mkdirSync(dirname(out), { recursive: true })
const glb = writeCharacterGlb(buildGeneratedTemplate(), buildClips())
writeFileSync(out, glb)
console.log(`personagem: ${out} (${(glb.byteLength / 1024).toFixed(0)} KB)`)
