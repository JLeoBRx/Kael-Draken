import * as THREE from 'three'
import { itemDef } from '../../shared/config/items'
import type { GameMap } from '../../shared/maps/types'
import { CharFlag } from '../../shared/movement/character'
import type { GameEvent } from '../../shared/net/protocol'
import { chestInteractable, itemInteractable, type Interactable } from '../../shared/player/interact'
import type { WorldItem } from '../../shared/player/inventory'
import { CharacterModel, DUMMY_SKIN } from '../character/character-model'
import { buildChestModel, buildItemModel, buildRarityBeam } from '../render/item-models'

/**
 * O que existe no chão do mundo, do ponto de vista do cliente: itens,
 * baús e bonecos de treino. O estado vem só de eventos do servidor; aqui é
 * apresentação (modelos, animação, distância de desenho).
 */

interface ItemView extends WorldItem {
  obj: THREE.Object3D
  beam: THREE.Mesh | null
  phase: number
}

interface ChestView {
  model: THREE.Group
  opened: boolean
  open: number
}

interface DummyView {
  model: CharacterModel
  down: boolean
  fall: number
}

const ITEM_DRAW = 70
const BEAM_DRAW = 140
const CHEST_DRAW = 140

export class WorldItemsView {
  readonly items = new Map<number, ItemView>()
  private readonly chests: ChestView[]
  private readonly dummies: DummyView[]
  private readonly group = new THREE.Group()

  constructor(private readonly scene: THREE.Scene, private readonly map: GameMap) {
    scene.add(this.group)
    this.chests = map.chests.map((c) => {
      const model = buildChestModel()
      model.position.set(c.x, c.y, c.z)
      model.rotation.y = c.yaw
      this.group.add(model)
      return { model, opened: false, open: 0 }
    })
    this.dummies = map.targets.map((t) => {
      const model = new CharacterModel(DUMMY_SKIN)
      model.setName('Boneco de treino')
      this.group.add(model.root)
      model.update({ x: t.x, y: t.y, z: t.z, vx: 0, vy: 0, vz: 0, yaw: t.yaw, pitch: 0, flags: CharFlag.Grounded }, 1)
      return { model, down: false, fall: 0 }
    })
  }

  apply(e: GameEvent): void {
    switch (e.type) {
      case 'itemSpawn': {
        this.remove(e.id)
        const obj = buildItemModel(e.item, e.rarity)
        obj.position.set(e.x, e.y + 0.25, e.z)
        this.group.add(obj)
        const def = itemDef(e.item)
        let beam: THREE.Mesh | null = null
        if (def && (def.kind === 'weapon' || def.kind === 'consumable')) {
          beam = buildRarityBeam(e.rarity)
          beam.position.set(e.x, e.y, e.z)
          this.group.add(beam)
        }
        this.items.set(e.id, { id: e.id, item: e.item, rarity: e.rarity, count: e.count, ammo: e.ammo, x: e.x, y: e.y, z: e.z, obj, beam, phase: Math.random() * 6 })
        break
      }
      case 'itemRemove':
        this.remove(e.id)
        break
      case 'chestOpen': {
        const c = this.chests[e.chest]
        if (c) c.opened = true
        break
      }
      case 'target': {
        const d = this.dummies[e.id]
        if (d) d.down = e.down
        break
      }
      default:
        break
    }
  }

  private remove(id: number): void {
    const it = this.items.get(id)
    if (!it) return
    this.group.remove(it.obj)
    if (it.beam) this.group.remove(it.beam)
    it.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    it.beam?.geometry.dispose()
    this.items.delete(id)
  }

  /** O que pode ser pego/aberto perto de (x, z) — mesma regra do servidor. */
  interactablesNear(x: number, z: number): Interactable[] {
    const out: Interactable[] = []
    for (const it of this.items.values()) if (Math.abs(it.x - x) < 3 && Math.abs(it.z - z) < 3) out.push(itemInteractable(it.id, it.x, it.y, it.z))
    this.map.chests.forEach((c, i) => {
      if (!this.chests[i].opened && Math.abs(c.x - x) < 3 && Math.abs(c.z - z) < 3) out.push(chestInteractable(i, c.x, c.y, c.z))
    })
    return out
  }

  chestPosition(i: number): THREE.Vector3 | null {
    const c = this.map.chests[i]
    return c ? new THREE.Vector3(c.x, c.y + 0.4, c.z) : null
  }

  update(dt: number, focus: THREE.Vector3, elapsed: number): void {
    for (const it of this.items.values()) {
      const d = Math.hypot(it.x - focus.x, it.z - focus.z)
      it.obj.visible = d < ITEM_DRAW
      if (it.beam) it.beam.visible = d < BEAM_DRAW
      if (it.obj.visible) {
        it.obj.rotation.y = elapsed * 0.9 + it.phase
        it.obj.position.y = it.y + 0.25 + Math.sin(elapsed * 2 + it.phase) * 0.05
      }
    }
    for (const c of this.chests) {
      const d = c.model.position.distanceTo(focus)
      c.model.visible = d < CHEST_DRAW
      if (c.opened && c.open < 1) c.open = Math.min(1, c.open + dt * 3)
      const lid = c.model.userData.lid as THREE.Object3D
      lid.rotation.x = -c.open * 1.9
    }
    for (const dm of this.dummies) {
      dm.fall += ((dm.down ? 1 : 0) - dm.fall) * Math.min(1, dt * 8)
      dm.model.root.rotation.x = -dm.fall * 1.45
    }
  }

  dispose(): void {
    for (const id of [...this.items.keys()]) this.remove(id)
    for (const d of this.dummies) d.model.dispose()
    this.chests.forEach((c) => c.model.traverse((o) => (o as THREE.Mesh).geometry?.dispose()))
    this.scene.remove(this.group)
  }
}
