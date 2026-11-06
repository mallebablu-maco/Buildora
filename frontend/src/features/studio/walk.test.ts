import { describe, expect, it } from 'vitest'
import { buildModel } from './model'
import { generatedProject } from './testFixtures'
import { obstacles, RADIUS, startPose, step } from './walk'

const m = buildModel(generatedProject({ floors: 2, length: 12, width: 9 }).p)
const inside = (x: number, z: number) => Math.abs(x) < m.length / 2 && Math.abs(z) < m.width / 2
const walk = (from: { x: number; z: number }, yaw: number, metres: number, obs = obstacles(m, 1)) => {
  let p = { ...from }
  const dx = -Math.sin(yaw) * 0.05, dz = -Math.cos(yaw) * 0.05
  for (let i = 0; i < metres / 0.05; i++) p = step(p, dx, dz, obs, 40)
  return p
}

describe('walk-through', () => {
  it('starts outside the main door, facing it, and walking straight ahead goes in through the doorway', () => {
    const s = startPose(m, 1)
    expect(inside(s.x, s.z)).toBe(false)
    const end = walk(s, s.yaw, 4.5)
    expect(inside(end.x, end.z)).toBe(true)
  })
  it('walls stop you: walking into the outside wall from inside never gets through', () => {
    const r = m.floors[0].rooms.find((x) => x.boundary.N && x.type !== 'staircase')!
    const end = walk({ x: r.cx, z: r.cz }, 0, 10) // yaw 0 = towards -Z (north)
    expect(end.z).toBeGreaterThan(-m.width / 2 + m.wallT / 2 + RADIUS - 1e-6)
    expect(inside(end.x, end.z)).toBe(true)
  })
  it('upstairs: starts on free floor next to the staircase, and the stairwell blocks', () => {
    const s = startPose(m, 2)
    const obs = obstacles(m, 2)
    expect(obs.some((o) => s.x + RADIUS > o.x0 && s.x - RADIUS < o.x1 && s.z + RADIUS > o.z0 && s.z - RADIUS < o.z1)).toBe(false)
    const hole = m.floors[1].holes[0].rect
    expect(obs).toContainEqual(hole)
    // right beside the stairwell, in the passage, facing away from it
    const room = m.floors[1].rooms.find((r) => s.x > r.x0 && s.x < r.x1 && s.z > r.z0 && s.z < r.z1)!
    expect(room.type).toBe('corridor')
    const gap = Math.max(hole.x0 - s.x, s.x - hole.x1, hole.z0 - s.z, s.z - hole.z1)
    expect(gap).toBeLessThan(1)
    const ahead = walk(s, s.yaw, 0.5, obs)
    expect(Math.hypot(ahead.x - (hole.x0 + hole.x1) / 2, ahead.z - (hole.z0 + hole.z1) / 2)).toBeGreaterThan(Math.hypot(s.x - (hole.x0 + hole.x1) / 2, s.z - (hole.z0 + hole.z1) / 2))
  })
  it('slides along a wall instead of sticking to it', () => {
    const obs = [{ x0: -10, x1: 10, z0: -1, z1: 0 }]
    const p = step({ x: 0, z: 0.3 }, 0.1, -0.2, obs, 40)
    expect(p).toEqual({ x: 0.1, z: 0.3 })
  })
})
