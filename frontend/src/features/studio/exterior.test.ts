import { describe, expect, it } from 'vitest'
import { entranceParts, GARDEN_MARGIN, gardenParts, mainEntrance, sunshades } from './exterior'
import { buildModel } from './model'
import { generatedProject } from './testFixtures'

const m = buildModel(generatedProject({ floors: 2, length: 12, width: 9 }).p)
const ext = (b: { cx: number; cz: number; sx: number; sz: number }) => ({ x0: b.cx - b.sx / 2, x1: b.cx + b.sx / 2, z0: b.cz - b.sz / 2, z1: b.cz + b.sz / 2 })
const outsideBuilding = (b: { cx: number; cz: number; sx: number; sz: number }) => {
  const r = ext(b), hx = m.length / 2 + m.wallT / 2 - 1e-6, hz = m.width / 2 + m.wallT / 2 - 1e-6
  return r.x1 <= -hx || r.x0 >= hx || r.z1 <= -hz || r.z0 >= hz
}

describe('exterior details', () => {
  it('one sunshade per outside window/door, all outside the walls and above the opening', () => {
    for (const f of m.floors) {
      const outer = f.openings.filter((o) => f.walls.find((w) => w.id === o.wallId)?.exterior)
      const boxes = sunshades(f, false)
      expect(boxes).toHaveLength(outer.length)
      boxes.forEach((b, i) => {
        expect(outsideBuilding(b)).toBe(true)
        expect(b.cy - b.sy / 2).toBeGreaterThan(f.y + outer[i].sill + outer[i].height)
        expect(b.cy + b.sy / 2).toBeLessThan(f.y + m.height)
      })
    }
  })
  it('entrance: canopy and step in front of the main door, outside the building', () => {
    const e = mainEntrance(m)!
    expect(e.o.entrance).toBe(true)
    const { canopy, step } = entranceParts(m)
    expect(canopy).toHaveLength(1); expect(step).toHaveLength(1)
    for (const b of [...canopy, ...step]) expect(outsideBuilding(b)).toBe(true)
    expect(step[0].cy + step[0].sy / 2).toBeLessThanOrEqual(0)
    // with the canopy on, the main door gets no separate sunshade
    expect(sunshades(m.floors[0], true)).toHaveLength(sunshades(m.floors[0], false).length - 1)
  })
  it('garden: compound wall around the plot with a gate in front of the entrance, path from gate to door', () => {
    const { walls, lawn, path } = gardenParts(m)
    expect(lawn.x1).toBeCloseTo(m.length / 2 + m.wallT / 2 + GARDEN_MARGIN)
    expect(walls.length).toBe(5) // four sides, the entrance side split by the gate
    const e = mainEntrance(m)!
    const blocked = walls.some((w) => { const r = ext(w); return e.o.orientation === 'x' ? r.x0 < e.o.center && r.x1 > e.o.center && Math.sign(w.cz) === Math.sign(e.face) : r.z0 < e.o.center && r.z1 > e.o.center && Math.sign(w.cx) === Math.sign(e.face) })
    expect(blocked).toBe(false)
    expect(path).not.toBeNull()
  })
})
