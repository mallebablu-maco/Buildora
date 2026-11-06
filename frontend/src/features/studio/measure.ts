/**
 * Measure tool: points snap to what you would measure on a real plan (wall-face and room corners, wall faces),
 * otherwise to a 5 cm grid in building-local metres. World metres; the plan uses (x, z).
 */
import type { FloorModel, Model3D } from './model'

export type P2 = [number, number]
export type P3 = [number, number, number]
export interface Measure2D { a: P2; b: P2 }
export interface Measure3D { a: P3; b: P3 }

const CORNER_SNAP = 0.25
const LINE_SNAP = 0.12
const GRID = 0.05

/** Corners and face lines of everything drawn on this floor's plan. */
export function snapTargets(f: FloorModel, m: Model3D) {
  const corners: P2[] = []
  const xs = new Set<number>(), zs = new Set<number>()
  const add = (x0: number, x1: number, z0: number, z1: number) => {
    corners.push([x0, z0], [x1, z0], [x0, z1], [x1, z1])
    xs.add(x0); xs.add(x1); zs.add(z0); zs.add(z1)
  }
  for (const w of f.walls) for (const b of w.pieces) add(b.cx - b.sx / 2, b.cx + b.sx / 2, b.cz - b.sz / 2, b.cz + b.sz / 2)
  for (const r of f.rooms) add(r.x0, r.x1, r.z0, r.z1)
  const ex = m.length / 2 + m.wallT / 2, ez = m.width / 2 + m.wallT / 2
  add(-ex, ex, -ez, ez)
  return { corners, xs: [...xs], zs: [...zs], origin: [-m.length / 2, -m.width / 2] as P2 }
}

/** Snap a plan point: a nearby corner wins, then a nearby face line on each axis, then the grid. */
export function snapPoint(p: P2, t: ReturnType<typeof snapTargets>, scale = 1): { p: P2; snapped: boolean } {
  let best: P2 | null = null, bd = CORNER_SNAP * scale
  for (const c of t.corners) { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d <= bd) { bd = d; best = c } }
  if (best) return { p: [best[0], best[1]], snapped: true }
  const near = (v: number, lines: number[], o: number) => {
    let b: number | null = null
    for (const l of lines) if (Math.abs(l - v) <= LINE_SNAP * scale && (b === null || Math.abs(l - v) < Math.abs(b - v))) b = l
    return b ?? o + Math.round((v - o) / GRID) * GRID
  }
  const x = near(p[0], t.xs, t.origin[0]), z = near(p[1], t.zs, t.origin[1])
  return { p: [x, z], snapped: t.xs.includes(x) || t.zs.includes(z) }
}

export const dist2 = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1])
export const dist3 = (a: P3, b: P3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
