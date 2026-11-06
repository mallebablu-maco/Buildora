/**
 * Real staircases: a staircase room with another staircase room directly above it gets a dog-leg (U-shaped) stair
 * (or a single straight flight when the room is too narrow for two), and the floor above gets a stairwell opening
 * with a guard rail. Pure geometry in world metres (same frame as model.ts); only the 3D viewer and the 2D plan use it.
 */
import type { Box, RoomBox } from './model'

export interface Rect { x0: number; x1: number; z0: number; z1: number }
/** A straight bar (handrail) from `a` to `b`, drawn with a small square section. */
export interface Segment { a: [number, number, number]; b: [number, number, number] }

export interface Stair {
  roomId: string
  /** clear rectangle the stair occupies (inside the wall faces) */
  rect: Rect
  /** 'x' = flights run along X, 'z' = along Z */
  axis: 'x' | 'z'
  kind: 'u' | 'straight'
  risers: number
  riser: number
  tread: number
  /** solid treads + landing */
  steps: Box[]
  /** posts (vertical) */
  posts: Box[]
  /** handrails */
  rails: Segment[]
  /** tread edges for the 2D plan: [along, crossFrom, crossTo] in world metres along `axis` */
  planTreads: { at: number; c0: number; c1: number }[]
  /** direction arrow for the 2D plan (world x/z points) */
  planArrow: [number, number][]
}

export interface StairHole { rect: Rect; guard: { posts: Box[]; rails: Segment[] } }

const MAX_RISER = 0.175
const MAX_TREAD = 0.3
const WAIST = 0.15
const LANDING_T = 0.18
const RAIL_H = 0.9
const RAIL = 0.045
const GAP = 0.06

export const rectOverlap = (a: Rect, b: Rect): Rect | null => {
  const r = { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) }
  return r.x1 - r.x0 > 1e-6 && r.z1 - r.z0 > 1e-6 ? r : null
}

/** `rect` minus `holes`, as non-overlapping rectangles (used for the floor slab and floor finish around a stairwell). */
export function subtractRects(rect: Rect, holes: Rect[]): Rect[] {
  let parts: Rect[] = [rect]
  for (const h of holes) {
    const next: Rect[] = []
    for (const p of parts) {
      const o = rectOverlap(p, h)
      if (!o) { next.push(p); continue }
      if (o.z0 > p.z0) next.push({ ...p, z1: o.z0 })
      if (o.z1 < p.z1) next.push({ ...p, z0: o.z1 })
      if (o.x0 > p.x0) next.push({ x0: p.x0, x1: o.x0, z0: o.z0, z1: o.z1 })
      if (o.x1 < p.x1) next.push({ x0: o.x1, x1: p.x1, z0: o.z0, z1: o.z1 })
    }
    parts = next
  }
  return parts.filter((p) => p.x1 - p.x0 > 1e-4 && p.z1 - p.z0 > 1e-4)
}

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box =>
  ({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 })

/** Which short end of the stair is the way in: not an exterior wall, and touching another room (ideally a passage). */
function accessAtHigh(r: RoomBox, axis: 'x' | 'z', neighbours: RoomBox[]): boolean {
  const score = (high: boolean) => {
    const side = axis === 'x' ? (high ? 'E' : 'W') : (high ? 'S' : 'N')
    let s = r.boundary[side] ? -2 : 0
    const line = axis === 'x' ? (high ? r.x1 : r.x0) : (high ? r.z1 : r.z0)
    for (const o of neighbours) {
      if (o.id === r.id) continue
      const touches = axis === 'x'
        ? Math.abs((high ? o.x0 : o.x1) - line) < 0.06 && Math.min(o.z1, r.z1) - Math.max(o.z0, r.z0) > 0.3
        : Math.abs((high ? o.z0 : o.z1) - line) < 0.06 && Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0) > 0.3
      if (touches) s += o.type === 'corridor' ? 2 : 1
    }
    return s
  }
  const hi = score(true), lo = score(false)
  if (hi !== lo) return hi > lo
  // tie: start nearer the middle of the building
  return axis === 'x' ? Math.abs(r.x1) < Math.abs(r.x0) : Math.abs(r.z1) < Math.abs(r.z0)
}

/**
 * Builds the stair for staircase room `r` (floor surface at `r.y`) rising `rise` metres to the next floor,
 * inside `area` (the part of the room that also lies under a staircase on the floor above).
 */
export function buildStair(r: RoomBox, area: Rect, rise: number, neighbours: RoomBox[]): Stair | null {
  // clear area inside the wall faces
  const c: Rect = {
    x0: Math.max(area.x0, r.x0 + r.inset.W), x1: Math.min(area.x1, r.x1 - r.inset.E),
    z0: Math.max(area.z0, r.z0 + r.inset.N), z1: Math.min(area.z1, r.z1 - r.inset.S),
  }
  const sx = c.x1 - c.x0, sz = c.z1 - c.z0
  if (sx < 0.6 || sz < 0.6 || rise <= 0) return null
  const axis: 'x' | 'z' = sx >= sz ? 'x' : 'z'
  const long = Math.max(sx, sz), cross = Math.min(sx, sz)
  const high = accessAtHigh(r, axis, neighbours)
  // along-axis coordinate of the access end, and the direction pointing into the room
  const a = axis === 'x' ? (high ? c.x1 : c.x0) : (high ? c.z1 : c.z0)
  const d = high ? -1 : 1
  const [c0, c1] = axis === 'x' ? [c.z0, c.z1] : [c.x0, c.x1]
  const y = r.y
  const n = Math.max(2, Math.ceil(rise / MAX_RISER - 1e-9))
  const rr = rise / n

  // world box from along-range [u0,u1] (any order), height range, cross-range
  const at = (u0: number, u1: number, y0: number, y1: number, v0: number, v1: number): Box => {
    const lo = Math.min(u0, u1), hi = Math.max(u0, u1)
    return axis === 'x' ? box(lo, hi, y0, y1, v0, v1) : box(v0, v1, y0, y1, lo, hi)
  }
  const pt = (u: number, h: number, v: number): [number, number, number] => (axis === 'x' ? [u, h, v] : [v, h, u])
  const step = (u0: number, u1: number, top: number, v0: number, v1: number) => at(u0, u1, Math.max(y, top - rr - WAIST), top, v0, v1)
  const post = (u: number, base: number, v: number) => at(u - RAIL / 2, u + RAIL / 2, base, base + RAIL_H, v - RAIL / 2, v + RAIL / 2)

  const steps: Box[] = [], posts: Box[] = [], rails: Segment[] = [], planTreads: Stair['planTreads'] = []
  let planArrow: [number, number][] = []
  const u = (k: number, t: number) => a + d * k * t // along-axis coordinate k treads in from the access end
  const flat = (p: [number, number, number]): [number, number] => [p[0], p[2]]

  if (cross >= 0.85) {
    // dog-leg: flight 1 up one half away from the access end, landing at the far end, flight 2 back on the other half
    const k1 = Math.ceil(n / 2), k2 = n - k1
    const landing = Math.min(Math.max(cross / 2, 0.7), 1.2)
    const t = Math.min(MAX_TREAD, (long - landing) / Math.max(1, k1 - 1))
    if (t < 0.12) return null
    const m = (c0 + c1) / 2
    const f1: [number, number] = [c0, m - GAP / 2], f2: [number, number] = [m + GAP / 2, c1]
    const far = a + d * long
    for (let j = 1; j < k1; j++) steps.push(step(u(j - 1, t), u(j, t), y + j * rr, f1[0], f1[1]))
    const yl = y + k1 * rr
    steps.push(at(u(k1 - 1, t), far, Math.max(y, yl - LANDING_T), yl, c0, c1))
    if (k2 < k1) steps.push(at(u(k2 - 1, t), u(k1 - 1, t), Math.max(y, yl - LANDING_T), yl, f2[0], f2[1]))
    for (let j = 1; j < k2; j++) steps.push(step(u(k2 - j, t), u(k2 - j - 1, t), yl + j * rr, f2[0], f2[1]))
    // inner handrails (the outer sides are room walls)
    const v1 = m - GAP / 2 - RAIL, v2 = m + GAP / 2 + RAIL
    const r1a = pt(u(0, t), y + rr + RAIL_H, v1), r1b = pt(u(k1 - 1, t), yl + RAIL_H, v1)
    const r2a = pt(u(k2 - 1, t), yl + RAIL_H, v2), r2b = pt(u(0, t), y + n * rr + RAIL_H, v2)
    rails.push({ a: r1a, b: r1b }, { a: r2a, b: r2b }, { a: r1b, b: pt(u(k1 - 1, t), yl + RAIL_H, v2) })
    posts.push(post(u(0, t), y + rr, v1), post(u(k1 - 1, t), yl, v1), post(u(k1 - 1, t), yl, v2))
    for (let j = 0; j < Math.max(k1, k2); j++) planTreads.push({ at: u(j, t), c0, c1: j < k2 ? c1 : m })
    planArrow = [flat(pt(u(0, t), 0, (f1[0] + f1[1]) / 2)), flat(pt(far - d * landing / 2, 0, (f1[0] + f1[1]) / 2)), flat(pt(far - d * landing / 2, 0, (f2[0] + f2[1]) / 2)), flat(pt(u(0, t), 0, (f2[0] + f2[1]) / 2))]
    return { roomId: r.id, rect: c, axis, kind: 'u', risers: n, riser: rr, tread: t, steps, posts, rails, planTreads, planArrow }
  }

  // too narrow for two flights: one straight flight from the access end
  const t = Math.min(MAX_TREAD, long / (n - 1))
  if (t < 0.12) return null
  for (let j = 1; j < n; j++) steps.push(step(u(j - 1, t), u(j, t), y + j * rr, c0, c1))
  for (let j = 0; j < n; j++) planTreads.push({ at: u(j, t), c0, c1 })
  planArrow = [flat(pt(u(0, t), 0, (c0 + c1) / 2)), flat(pt(u(n - 1, t), 0, (c0 + c1) / 2))]
  return { roomId: r.id, rect: c, axis, kind: 'straight', risers: n, riser: rr, tread: t, steps, posts, rails, planTreads, planArrow }
}

/** Stairwell on the floor above: the opening over the stair, with a guard rail where people walk past the drop. */
export function stairHole(s: Stair, upperY: number): StairHole {
  const posts: Box[] = [], rails: Segment[] = []
  if (s.kind === 'u') {
    // the arrival edge over flight 2 stays open; guard the access edge over flight 1
    const { rect: c, axis } = s
    const [c0, c1] = axis === 'x' ? [c.z0, c.z1] : [c.x0, c.x1]
    const m = (c0 + c1) / 2
    const first = s.steps[0]
    const startAlong = axis === 'x' ? first.cx : first.cz
    const a = Math.abs(startAlong - (axis === 'x' ? c.x0 : c.z0)) < Math.abs(startAlong - (axis === 'x' ? c.x1 : c.z1)) ? (axis === 'x' ? c.x0 : c.z0) : (axis === 'x' ? c.x1 : c.z1)
    const yr = upperY + RAIL_H
    const P = (v: number): [number, number, number] => (axis === 'x' ? [a, yr, v] : [v, yr, a])
    rails.push({ a: P(c0), b: P(m) })
    for (const v of [c0 + RAIL, (c0 + m) / 2, m]) {
      posts.push(axis === 'x' ? box(a - RAIL / 2, a + RAIL / 2, upperY, yr, v - RAIL / 2, v + RAIL / 2) : box(v - RAIL / 2, v + RAIL / 2, upperY, yr, a - RAIL / 2, a + RAIL / 2))
    }
  }
  return { rect: s.rect, guard: { posts, rails } }
}
