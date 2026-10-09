import type { EntityType } from '../editorial'
import { ENTITY_TYPES } from '../editorial'

/**
 * As referências cruzadas são simétricas. Para que exista um único registro
 * por par, o par é sempre guardado com o tipo de menor posição em ENTITY_TYPES
 * do lado "a" (e, para o mesmo tipo, o menor id).
 */
export function normalizePair(t1: EntityType, id1: number, t2: EntityType, id2: number) {
  const r1 = ENTITY_TYPES.indexOf(t1)
  const r2 = ENTITY_TYPES.indexOf(t2)
  if (r1 < r2 || (r1 === r2 && id1 <= id2)) {
    return { aType: t1, aId: id1, bType: t2, bId: id2 }
  }
  return { aType: t2, aId: id2, bType: t1, bId: id1 }
}

/** Indica de que lado do par o tipo "self" fica quando relacionado a "other". */
export function selfIsA(self: EntityType, other: EntityType): boolean {
  return ENTITY_TYPES.indexOf(self) <= ENTITY_TYPES.indexOf(other)
}
