/**
 * Optional exterior details (visual only): window sunshades (chajjas), an entrance canopy with a step, and a garden
 * with a compound wall, gate and path. World metres, same frame as model.ts. Nothing here touches the estimate.
 */
import type { Box, FloorModel, Model3D, Opening, Side } from './model'

export const GARDEN_MARGIN = 2.5
const OUT: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }

/** Outside face of the wall an opening sits in, and which way is outside. */
function outside(f: FloorModel, o: Opening): { side: Side; face: number } | null {
  const w = f.walls.find((x) => x.id === o.wallId)
  if (!w || !w.exterior || !w.side) return null
  const [dx, dz] = OUT[w.side]
  return { side: w.side, face: w.line + (dx || dz) * (w.t / 2) }
}

/** Box sticking out of the outside face: `along` range on the wall, `out` metres deep, y range. */
function projecting(o: Opening, side: Side, face: number, a0: number, a1: number, out: number, y0: number, y1: number, from = 0): Box {
  const [dx, dz] = OUT[side]
  const n0 = face + (dx || dz) * from, n1 = face + (dx || dz) * (from + out)
  const lo = Math.min(n0, n1), hi = Math.max(n0, n1)
  return o.orientation === 'x'
    ? { cx: (a0 + a1) / 2, cy: (y0 + y1) / 2, cz: (lo + hi) / 2, sx: a1 - a0, sy: y1 - y0, sz: hi - lo }
    : { cx: (lo + hi) / 2, cy: (y0 + y1) / 2, cz: (a0 + a1) / 2, sx: hi - lo, sy: y1 - y0, sz: a1 - a0 }
}

/** A thin concrete shade over every outside window and door (the main entrance gets the canopy instead when that is on). */
export function sunshades(f: FloorModel, skipEntrance: boolean): Box[] {
  const out: Box[] = []
  for (const o of f.openings) {
    if (skipEntrance && o.entrance) continue
    const at = outside(f, o)
    if (!at) continue
    const top = Math.min(f.y + o.sill + o.height + 0.2, f.y + 0.98 * (f.walls[0]?.h ?? 3))
    const half = o.width / 2 + 0.15
    out.push(projecting(o, at.side, at.face, o.center - half, o.center + half, o.kind === 'door' ? 0.6 : 0.45, top - 0.075, top))
  }
  return out
}

/** The ground-floor main entrance door, if there is one in an outside wall. */
export function mainEntrance(m: Model3D): { o: Opening; side: Side; face: number } | null {
  const f = m.floors[0]
  if (!f) return null
  const o = f.openings.find((x) => x.kind === 'door' && x.entrance) ?? null
  const at = o && outside(f, o)
  return o && at ? { o, ...at } : null
}

/** Porch canopy over the main door and a step down to the ground. */
export function entranceParts(m: Model3D): { canopy: Box[]; step: Box[] } {
  const e = mainEntrance(m)
  if (!e) return { canopy: [], step: [] }
  const { o, side, face } = e
  const ground = -m.slab - 0.03
  const top = Math.min(o.sill + o.height + 0.35, m.height - 0.05)
  const half = o.width / 2 + 0.7, stepHalf = o.width / 2 + 0.4
  return {
    canopy: [projecting(o, side, face, o.center - half, o.center + half, 1.2, top - 0.12, top)],
    step: [projecting(o, side, face, o.center - stepHalf, o.center + stepHalf, 0.9, ground, -0.01)],
  }
}

export interface Rect2 { x0: number; x1: number; z0: number; z1: number }

/** Compound wall (with a gate opening facing the entrance), lawn and a paved path from the gate to the door. */
export function gardenParts(m: Model3D): { walls: Box[]; lawn: Rect2; path: Rect2 | null } {
  const g = GARDEN_MARGIN, t = 0.2, h = 1.2, ground = -m.slab - 0.03
  const ex = m.length / 2 + m.wallT / 2 + g, ez = m.width / 2 + m.wallT / 2 + g
  const e = mainEntrance(m)
  const side: Side = e?.side ?? 'S'
  const along = e ? e.o.center : 0
  const gate = 3.0
  const span = side === 'N' || side === 'S' ? ex : ez
  const g0 = Math.max(-span + t, along - gate / 2), g1 = Math.min(span - t, along + gate / 2)
  const wall = (s: Side, a0: number, a1: number): Box => {
    const [dx, dz] = OUT[s]
    return dz
      ? { cx: (a0 + a1) / 2, cy: ground + h / 2, cz: dz * (ez - t / 2), sx: a1 - a0, sy: h, sz: t }
      : { cx: dx * (ex - t / 2), cy: ground + h / 2, cz: (a0 + a1) / 2, sx: t, sy: h, sz: a1 - a0 }
  }
  const walls: Box[] = []
  for (const s of ['N', 'S', 'W', 'E'] as Side[]) {
    const lo = s === 'N' || s === 'S' ? -ex : -ez + t, hi = s === 'N' || s === 'S' ? ex : ez - t
    if (s === side) { if (g0 - lo > 0.05) walls.push(wall(s, lo, g0)); if (hi - g1 > 0.05) walls.push(wall(s, g1, hi)) }
    else walls.push(wall(s, lo, hi))
  }
  let path: Rect2 | null = null
  if (e) {
    const pw = Math.max(1.2, e.o.width + 0.2) / 2
    const [dx, dz] = OUT[side]
    const n0 = e.face, n1 = (dx || dz) * (dz ? ez : ex)
    const lo = Math.min(n0, n1), hi = Math.max(n0, n1)
    path = dz ? { x0: along - pw, x1: along + pw, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: along - pw, z1: along + pw }
  }
  return { walls, lawn: { x0: -ex, x1: ex, z0: -ez, z1: ez }, path }
}
