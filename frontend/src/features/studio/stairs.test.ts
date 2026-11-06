import { describe, expect, it } from 'vitest'
import { buildModel } from './model'
import { subtractRects, type Rect } from './stairs'
import { generatedProject, project, room } from './testFixtures'

const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0)

describe('real staircases', () => {
  it('adds nothing to a one-storey building', () => {
    const m = buildModel(generatedProject({}).p)
    expect(m.floors.flatMap((f) => [...f.stairs, ...f.holes])).toHaveLength(0)
  })

  it('needs a staircase directly above: a staircase on the top floor only gets no stairs', () => {
    const p = project({ floors: 2, rooms: [room({ room_type: 'staircase', length: 4, width: 2.6, floor_number: 2, pos_x: 0, pos_y: 0 })] })
    const m = buildModel(p)
    expect(m.floors.flatMap((f) => [...f.stairs, ...f.holes])).toHaveLength(0)
  })

  for (const floors of [2, 3]) for (const variant of [0, 1, 2, 3]) for (const [length, width] of [[10, 8], [12, 9], [15, 11]]) {
    it(`generated ${floors}-storey ${length}x${width} (variant ${variant}): stairs between staircases, an opening above each`, () => {
      const { p } = generatedProject({ floors, variant, length, width })
      const m = buildModel(p)
      const rise = p.height + p.slab_thickness
      const hasStairRoom = (i: number) => !!m.floors[i]?.rooms.some((r) => r.type === 'staircase')
      expect(m.floors[0].stairs).toHaveLength(1)
      m.floors.forEach((f, i) => {
        // every staircase with one above it gets real stairs (the generator keeps staircases above each other)
        expect(f.stairs).toHaveLength(hasStairRoom(i) && hasStairRoom(i + 1) ? 1 : 0)
        expect(f.holes).toHaveLength(i > 0 && hasStairRoom(i - 1) && hasStairRoom(i) ? 1 : 0)
        for (const s of f.stairs) {
          const r = f.rooms.find((x) => x.id === s.roomId)!
          expect(r.type).toBe('staircase')
          expect(s.kind).toBe('u')
          expect(s.riser).toBeLessThanOrEqual(0.175 + 1e-9)
          expect(s.riser * s.risers).toBeCloseTo(rise, 6)
          for (const b of s.steps) {
            // inside the staircase room and between this floor and the next
            expect(b.cx - b.sx / 2).toBeGreaterThanOrEqual(r.x0 - 1e-6)
            expect(b.cx + b.sx / 2).toBeLessThanOrEqual(r.x1 + 1e-6)
            expect(b.cz - b.sz / 2).toBeGreaterThanOrEqual(r.z0 - 1e-6)
            expect(b.cz + b.sz / 2).toBeLessThanOrEqual(r.z1 + 1e-6)
            expect(b.cy - b.sy / 2).toBeGreaterThanOrEqual(f.y - 1e-6)
            expect(b.cy + b.sy / 2).toBeLessThan(f.y + rise)
          }
          // the opening above is exactly over the stair
          expect(m.floors[i + 1].holes[0].rect).toEqual(s.rect)
        }
      })
    })
  }

  it('the stairs leave walls, doors, windows and furniture unchanged', () => {
    const { p } = generatedProject({ floors: 2, length: 12, width: 9 })
    const withStairs = buildModel(p)
    const noStairs = buildModel({ ...p, rooms: p.rooms.map((r) => (r.floor_number === 2 && r.room_type === 'staircase' ? { ...r, room_type: 'corridor' } : r)) })
    const f1 = withStairs.floors[0], g1 = noStairs.floors[0]
    expect(f1.stairs).toHaveLength(1)
    expect(g1.stairs).toHaveLength(0)
    expect(f1.walls).toEqual(g1.walls)
    expect(f1.openings).toEqual(g1.openings)
    expect(f1.furniture).toEqual(g1.furniture)
  })

  it('a wide staircase gets two flights and a landing; a very narrow one a single flight', () => {
    const wide = buildModel(project({ floors: 2, length: 10, width: 8, rooms: [1, 2].map((fl) => room({ room_type: 'staircase', length: 4, width: 2.6, floor_number: fl, pos_x: 6, pos_y: 5.4 })) }))
    expect(wide.floors[0].stairs[0].kind).toBe('u')
    const narrow = buildModel(project({ floors: 2, length: 10, width: 8, rooms: [1, 2].map((fl) => room({ room_type: 'staircase', length: 5, width: 0.95, floor_number: fl, pos_x: 0, pos_y: 3 })) }))
    expect(narrow.floors[0].stairs[0].kind).toBe('straight')
  })
})

describe('subtractRects', () => {
  it('cuts holes out without overlaps or gaps', () => {
    const r = { x0: -5, x1: 5, z0: -4, z1: 4 }
    const holes = [{ x0: 1, x1: 3, z0: 0, z1: 2 }, { x0: -5, x1: -3, z0: -4, z1: -2 }]
    const parts = subtractRects(r, holes)
    expect(parts.reduce((s, p) => s + area(p), 0)).toBeCloseTo(area(r) - 4 - 4, 9)
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j]
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
      expect(ox > 1e-9 && oz > 1e-9).toBe(false)
    }
  })
  it('returns the rectangle itself when no hole touches it', () => {
    expect(subtractRects({ x0: 0, x1: 1, z0: 0, z1: 1 }, [{ x0: 2, x1: 3, z0: 2, z1: 3 }])).toEqual([{ x0: 0, x1: 1, z0: 0, z1: 1 }])
  })
})

describe('when stairs cannot be drawn', () => {
  it('rooms without positions: staircases are placed in the same corner on every floor, so they connect', () => {
    const rooms = [1, 2].flatMap((fl) => [
      room({ name: 'Bedroom', room_type: 'bedroom', length: fl === 1 ? 4 : 3, width: 3, floor_number: fl }),
      room({ name: 'Staircase', room_type: 'staircase', length: 3, width: 2.5, floor_number: fl }),
    ])
    const m = buildModel(project({ floors: 2, rooms }))
    expect(m.floors[0].stairs).toHaveLength(1)
    expect(m.issues.some((i) => i.code === 'stairs-not-aligned')).toBe(false)
  })
  it('says so when the staircases are not above each other', () => {
    const rooms = [room({ room_type: 'staircase', length: 3, width: 2.5, floor_number: 1, pos_x: 0, pos_y: 0 }), room({ room_type: 'staircase', length: 3, width: 2.5, floor_number: 2, pos_x: 6, pos_y: 5 })]
    const m = buildModel(project({ floors: 2, rooms }))
    expect(m.floors[0].stairs).toHaveLength(0)
    expect(m.issues.find((i) => i.code === 'stairs-not-aligned')?.message).toMatch(/floor 1 and floor 2 are not above each other/)
  })
})

describe('generated multi-storey buildings', () => {
  it('every floor with rooms is reached by real stairs (a lounge is added to one-row floors)', () => {
    for (const floors of [2, 3, 6]) for (const [length, width] of [[10, 8], [12, 9], [20, 12]]) {
      const { p, g } = generatedProject({ floors, length, width })
      expect(g.errors).toEqual([])
      const m = buildModel(p)
      for (let i = 0; i + 1 < m.floors.length; i++) if (m.floors[i + 1].rooms.length) expect(m.floors[i].stairs).toHaveLength(1)
      expect(m.issues.filter((x) => x.code === 'no-stairs' || x.code === 'stairs-not-aligned')).toEqual([])
    }
  })
})

