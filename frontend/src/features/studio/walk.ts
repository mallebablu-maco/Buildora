/**
 * Walk-through: where a person can stand on a floor (walls, window sills, stairs and stairwells block; doorways are
 * open), where the walk starts, and movement that slides along walls instead of passing through them. World metres.
 */
import { gardenParts, mainEntrance } from './exterior'
import type { Look } from './look'
import type { Model3D } from './model'

/** Buttons held down on screen (the on-screen arrows). */
export interface WalkInput { forward: boolean; back: boolean; left: boolean; right: boolean; turnLeft: boolean; turnRight: boolean }
export const newWalkInput = (): WalkInput => ({ forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false })

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Pose { x: number; z: number; yaw: number }

export const EYE = 1.6
export const RADIUS = 0.22
const OUT: Record<string, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }
const flat = (b: { cx: number; cz: number; sx: number; sz: number }): Rect => ({ x0: b.cx - b.sx / 2, x1: b.cx + b.sx / 2, z0: b.cz - b.sz / 2, z1: b.cz + b.sz / 2 })

/** Everything a person bumps into on floor `index` (between knee and head height). */
export function obstacles(m: Model3D, index: number, look?: Look): Rect[] {
  const f = m.floors.find((x) => x.index === index)
  if (!f) return []
  const lo = f.y + 0.3, hi = f.y + 1.75
  const hits = (b: { cy: number; sy: number }) => b.cy - b.sy / 2 < hi && b.cy + b.sy / 2 > lo
  const out: Rect[] = []
  for (const w of f.walls) for (const b of w.pieces) if (hits(b)) out.push(flat(b))
  for (const s of f.stairs) out.push(s.rect)
  for (const h of f.holes) out.push(h.rect)
  if (index === 1 && look?.garden) for (const b of gardenParts(m).walls) out.push(flat(b))
  return out
}

const blocked = (x: number, z: number, obs: Rect[], r = RADIUS) =>
  obs.some((o) => x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1)

/** Move by (dx, dz); if that bumps into something, slide along it (try each axis on its own). */
export function step(p: { x: number; z: number }, dx: number, dz: number, obs: Rect[], limit: number): { x: number; z: number } {
  const clamp = (v: number) => Math.max(-limit, Math.min(limit, v))
  const nx = clamp(p.x + dx), nz = clamp(p.z + dz)
  if (!blocked(nx, nz, obs)) return { x: nx, z: nz }
  if (!blocked(nx, p.z, obs)) return { x: nx, z: p.z }
  if (!blocked(p.x, nz, obs)) return { x: p.x, z: nz }
  return { x: p.x, z: p.z }
}

/** Camera yaw that looks along (nx, nz) (three.js cameras look down -Z at yaw 0). */
export const yawFor = (nx: number, nz: number) => Math.atan2(-nx, -nz)

/** Ground floor: outside the main door, facing it. Upper floors: at the staircase (else the largest room). */
export function startPose(m: Model3D, index: number): Pose {
  const e = index === 1 ? mainEntrance(m) : null
  if (e) {
    const [nx, nz] = OUT[e.side]
    const out = e.face + (nx || nz) * 3
    const x = e.o.orientation === 'x' ? e.o.center : out, z = e.o.orientation === 'x' ? out : e.o.center
    return { x, z, yaw: yawFor(-nx, -nz) }
  }
  const f = m.floors.find((x) => x.index === index) ?? m.floors[0]
  if (!f) return { x: 0, z: 0, yaw: 0 }
  const obs = obstacles(m, f.index)
  const free = (x: number, z: number) => !blocked(x, z, obs) && Math.abs(x) < m.length / 2 && Math.abs(z) < m.width / 2
  const roomAt = (x: number, z: number) => f.rooms.find((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)
  // at the top of the stairs: just beside the stairwell, facing away from it (a passage beats a room)
  const hole = f.holes[0]?.rect
  if (hole) {
    const mx = (hole.x0 + hole.x1) / 2, mz = (hole.z0 + hole.z1) / 2, d = RADIUS + 0.35
    const spots = [
      { x: hole.x1 + d, z: mz, yaw: yawFor(1, 0) }, { x: hole.x0 - d, z: mz, yaw: yawFor(-1, 0) },
      { x: mx, z: hole.z1 + d, yaw: yawFor(0, 1) }, { x: mx, z: hole.z0 - d, yaw: yawFor(0, -1) },
    ].filter((c) => free(c.x, c.z))
    const best = spots.find((c) => roomAt(c.x, c.z)?.type === 'corridor') ?? spots[0]
    if (best) return best
  }
  // otherwise the middle of the largest room that has free floor there
  const rooms = [...f.rooms].sort((a, b) => b.sx * b.sz - a.sx * a.sz)
  const r = rooms.find((x) => free(x.cx, x.cz)) ?? rooms[0]
  return r ? { x: r.cx, z: r.cz, yaw: 0 } : { x: 0, z: 0, yaw: 0 }
}
