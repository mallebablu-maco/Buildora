/**
 * Moving / resizing a room in the 2D plan: pure geometry, world metres (same frame as model.ts).
 * Edges snap to the building outline and to other rooms' walls when close, otherwise to a 5 cm grid
 * (in building-local metres, so saved positions stay round numbers).
 */
export interface Rect { x0: number; x1: number; z0: number; z1: number }
export type Grip = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const MIN_SIDE = 0.5
export const MAX_SIDE = 50
const SNAP = 0.15
const GRID = 0.05
const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Nearest snap target within SNAP, else the 5 cm grid (grid measured from `origin`, the building's local zero). */
function snapHit(v: number, targets: number[], origin: number): { v: number; wall: boolean } {
  let best: number | null = null
  for (const t of targets) if (Math.abs(t - v) <= SNAP && (best === null || Math.abs(t - v) < Math.abs(best - v))) best = t
  return best != null ? { v: best, wall: true } : { v: origin + Math.round((v - origin) / GRID) * GRID, wall: false }
}
const snapLine = (v: number, targets: number[], origin: number) => snapHit(v, targets, origin).v

/** Start of a span of length `len` near `a`: snapping either end to a wall beats the grid. */
function snapSpan(a: number, len: number, targets: number[], origin: number): number {
  const lo = snapHit(a, targets, origin), hi = snapHit(a + len, targets, origin)
  if (lo.wall !== hi.wall) return lo.wall ? lo.v : hi.v - len
  return Math.abs(lo.v - a) <= Math.abs(hi.v - (a + len)) ? lo.v : hi.v - len
}

/**
 * New rectangle for a drag of `grip` by (dx, dz) from `start`. `others` are the other rooms on the floor,
 * `bounds` the building footprint (room centrelines).
 */
export function dragRect(start: Rect, grip: Grip, dx: number, dz: number, others: Rect[], bounds: Rect): Rect {
  const xs = [bounds.x0, bounds.x1, ...others.flatMap((o) => [o.x0, o.x1])]
  const zs = [bounds.z0, bounds.z1, ...others.flatMap((o) => [o.z0, o.z1])]
  const ox = bounds.x0, oz = bounds.z0
  if (grip === 'move') {
    const w = start.x1 - start.x0, d = start.z1 - start.z0
    const nx0 = snapSpan(start.x0 + dx, w, xs, ox), nz0 = snapSpan(start.z0 + dz, d, zs, oz)
    return { x0: r3(nx0), x1: r3(nx0 + w), z0: r3(nz0), z1: r3(nz0 + d) }
  }
  let { x0, x1, z0, z1 } = start
  if (grip.includes('w')) x0 = Math.min(snapLine(start.x0 + dx, xs, ox), x1 - MIN_SIDE)
  if (grip.includes('e')) x1 = Math.max(snapLine(start.x1 + dx, xs, ox), x0 + MIN_SIDE)
  if (grip.includes('n')) z0 = Math.min(snapLine(start.z0 + dz, zs, oz), z1 - MIN_SIDE)
  if (grip.includes('s')) z1 = Math.max(snapLine(start.z1 + dz, zs, oz), z0 + MIN_SIDE)
  return { x0: r3(x0), x1: r3(x1), z0: r3(z0), z1: r3(z1) }
}

/** Why the room cannot go there (null = fine). */
export function rectProblem(r: Rect, others: { rect: Rect; name: string }[], bounds: Rect): string | null {
  const w = r.x1 - r.x0, d = r.z1 - r.z0
  if (w < MIN_SIDE - 1e-6 || d < MIN_SIDE - 1e-6) return `Rooms must be at least ${MIN_SIDE} m on each side.`
  if (w > MAX_SIDE + 1e-6 || d > MAX_SIDE + 1e-6) return `Rooms can be at most ${MAX_SIDE} m on each side.`
  if (r.x0 < bounds.x0 - 0.01 || r.x1 > bounds.x1 + 0.01 || r.z0 < bounds.z0 - 0.01 || r.z1 > bounds.z1 + 0.01) return 'It must stay inside the building.'
  for (const o of others) {
    const ow = Math.min(r.x1, o.rect.x1) - Math.max(r.x0, o.rect.x0), od = Math.min(r.z1, o.rect.z1) - Math.max(r.z0, o.rect.z0)
    if (ow > 0.05 && od > 0.05) return `It would overlap "${o.name}".`
  }
  return null
}
