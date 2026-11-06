import { describe, expect, it } from 'vitest'
import { buildModel } from './model'
import { dist2, dist3, snapPoint, snapTargets } from './measure'
import { generatedProject } from './testFixtures'

const m = buildModel(generatedProject({ length: 10, width: 8 }).p)
const t = snapTargets(m.floors[0], m)

describe('measure tool', () => {
  it('snaps to the outer corner of the building', () => {
    const ex = m.length / 2 + m.wallT / 2, ez = m.width / 2 + m.wallT / 2
    expect(snapPoint([ex + 0.1, ez + 0.08], t).p).toEqual([ex, ez])
  })
  it('measures the outside length of the building exactly', () => {
    const ex = m.length / 2 + m.wallT / 2, ez = m.width / 2 + m.wallT / 2
    const a = snapPoint([-ex + 0.05, ez - 0.05], t).p, b = snapPoint([ex - 0.05, ez + 0.05], t).p
    expect(dist2(a, b)).toBeCloseTo(m.length + m.wallT, 6)
  })
  it('in each direction: on a wall line, or else on a 5 cm grid in building metres', () => {
    for (const q of [[0.0123, 0.4567], [-1.234, 2.3456], [3.3333, -2.2222]] as [number, number][]) {
      const p = snapPoint(q, t).p
      for (const [v, lines, o] of [[p[0], t.xs, -m.length / 2], [p[1], t.zs, -m.width / 2]] as [number, number[], number][]) {
        const onGrid = Math.abs(Math.round((v - o) / 0.05) * 0.05 - (v - o)) < 1e-9
        expect(lines.includes(v) || onGrid).toBe(true)
      }
    }
  })
  it('3D distance', () => {
    expect(dist3([0, 0, 0], [3, 4, 12])).toBe(13)
  })
})
