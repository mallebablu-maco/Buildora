import { describe, expect, it } from 'vitest'
import { buildingSchema, defaultWizardValues, detailsSchema, roomSchema, toPayload, wizardSchema } from './schemas'

const valid = { ...defaultWizardValues('Asha'), name: 'Sample G+1 Residence', floors: 2, rooms: [] }

describe('project forms', () => {
  it('accepts the defaults once a name is given', () => {
    expect(wizardSchema.safeParse(valid).success).toBe(true)
  })
  it('needs a name, and trims it', () => {
    expect(detailsSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false)
    expect(wizardSchema.parse({ ...valid, name: '  House  ' }).name).toBe('House')
  })
  it.each([[0], [51], [1.5]])('rejects %s floors', (floors) => {
    expect(detailsSchema.safeParse({ ...valid, floors }).success).toBe(false)
  })
  it('budget is optional but must be positive when given', () => {
    expect(detailsSchema.safeParse({ ...valid, budget: null }).success).toBe(true)
    expect(detailsSchema.safeParse({ ...valid, budget: 1500000 }).success).toBe(true)
    expect(detailsSchema.safeParse({ ...valid, budget: 0 }).success).toBe(false)
  })
  it('dimensions must be positive and sensible', () => {
    expect(buildingSchema.safeParse(valid).success).toBe(true)
    for (const patch of [{ length: 0 }, { width: -3 }, { length: 5000 }, { height: 1 }, { wall_thickness: 0 }, { slab_thickness: 2 }, { length: NaN }]) {
      expect(buildingSchema.safeParse({ ...valid, ...patch }).success, JSON.stringify(patch)).toBe(false)
    }
  })
  it('a blank number gives a readable message, not a crash', () => {
    const r = buildingSchema.safeParse({ ...valid, length: NaN })
    expect(r.error?.issues[0].message).toBe('Length: enter a number.')
  })
})

describe('rooms', () => {
  const room = { name: 'Living', room_type: 'living', floor_number: 1, length: 5, width: 5, doors: 1, windows: 2 }
  it('accepts a complete room', () => expect(roomSchema.safeParse(room).success).toBe(true))
  it('rejects bad rooms', () => {
    for (const patch of [{ name: '' }, { room_type: 'dungeon' }, { length: 0 }, { doors: -1 }, { windows: 1.5 }, { floor_number: 0 }]) {
      expect(roomSchema.safeParse({ ...room, ...patch }).success, JSON.stringify(patch)).toBe(false)
    }
  })
  it('a room cannot be on a floor the project does not have', () => {
    const r = wizardSchema.safeParse({ ...valid, floors: 1, rooms: [{ ...room, floor_number: 2 }] })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path).toEqual(['rooms', 0, 'floor_number'])
    expect(wizardSchema.safeParse({ ...valid, floors: 2, rooms: [{ ...room, floor_number: 2 }] }).success).toBe(true)
  })
})

describe('toPayload', () => {
  it('uses INR, and gives each room the building floor height', () => {
    const p = toPayload({ ...valid, height: 3.2, rooms: [{ name: 'Living', room_type: 'living', floor_number: 1, length: 5, width: 5, doors: 1, windows: 2 }] })
    expect(p.currency).toBe('INR')
    expect(p.rooms[0]).toMatchObject({ name: 'Living', height: 3.2, length: 5 })
    expect(p).toMatchObject({ name: 'Sample G+1 Residence', floors: 2, length: 10, width: 8, budget: null })
  })
})
