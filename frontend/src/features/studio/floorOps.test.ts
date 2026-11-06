import { describe, expect, it } from 'vitest'
import { buildModel } from './model'
import { clearFloor, copyFloor, floorSummaries } from './floorOps'
import { generatedProject, room } from './testFixtures'

describe('floor operations', () => {
  const { p } = generatedProject({ floors: 2, length: 12, width: 9 })
  const rooms = [...p.rooms, room({ id: 'x', floor_number: 3, pos_x: 0, pos_y: 0 })]
  const f2 = p.rooms.filter((r) => r.floor_number === 2)

  it('copies a floor onto other floors, replacing what was there and keeping the rest', () => {
    const next = copyFloor(rooms, 2, [3, 4])
    expect(next.filter((r) => r.floor_number === 1)).toHaveLength(p.rooms.filter((r) => r.floor_number === 1).length)
    expect(next.filter((r) => r.floor_number === 2)).toHaveLength(f2.length)
    for (const fl of [3, 4]) {
      const copy = next.filter((r) => r.floor_number === fl)
      expect(copy.map((r) => [r.name, r.room_type, r.pos_x, r.pos_y, r.length, r.width])).toEqual(f2.map((r) => [r.name, r.room_type, r.pos_x, r.pos_y, r.length, r.width]))
    }
    expect(next.some((r) => r.floor_number === 3 && r.name === 'R')).toBe(false) // the old floor-3 room was replaced
  })
  it('never copies a floor onto itself', () => {
    expect(copyFloor(rooms, 2, [2])).toHaveLength(rooms.length)
  })
  it('a copied upper floor gets real stairs to the floor above (staircases line up)', () => {
    const next = copyFloor(p.rooms, 2, [3])
    const m = buildModel({ ...p, floors: 3, rooms: next.map((r, i) => ({ ...r, id: `n${i}`, project_id: 'p', area: r.length * r.width })) })
    expect(m.floors[1].stairs).toHaveLength(1)
    expect(m.issues.filter((i) => i.severity === 'error')).toEqual([])
  })
  it('clears one floor and summarises each floor', () => {
    expect(clearFloor(rooms, 3).some((r) => r.floor_number === 3)).toBe(false)
    const s = floorSummaries(rooms, 4)
    expect(s.map((x) => x.rooms)).toEqual([p.rooms.filter((r) => r.floor_number === 1).length, f2.length, 1, 0])
    expect(s[2].area).toBeCloseTo(12)
  })
})
