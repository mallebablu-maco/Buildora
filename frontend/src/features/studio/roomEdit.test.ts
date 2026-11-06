import { describe, expect, it } from 'vitest'
import { dragRect, MIN_SIDE, rectProblem } from './roomEdit'

const bounds = { x0: -5, x1: 5, z0: -4, z1: 4 }
const room = { x0: -5, x1: -1, z0: -4, z1: -1 }
const other = { x0: 1, x1: 5, z0: -4, z1: 0 }

describe('dragging rooms in the 2D plan', () => {
  it('moves by the drag, rounded to 5 cm', () => {
    expect(dragRect(room, 'move', 1.23, 1.01, [], bounds)).toEqual({ x0: -3.75, x1: 0.25, z0: -3, z1: 0 })
  })
  it('snaps to a neighbouring wall when close', () => {
    // right edge lands 0.1 m short of the other room's left wall -> snaps onto it
    const r = dragRect(room, 'move', 1.9, 0, [other], bounds)
    expect(r.x1).toBe(1)
    expect(r.x1 - r.x0).toBeCloseTo(4)
  })
  it('resizes from an edge or a corner and never below the minimum size', () => {
    expect(dragRect(room, 'e', 0.52, 0, [], bounds)).toEqual({ ...room, x1: -0.5 })
    expect(dragRect(room, 'se', 1, 1, [], bounds)).toEqual({ ...room, x1: 0, z1: 0 })
    const tiny = dragRect(room, 'w', 10, 0, [], bounds)
    expect(tiny.x1 - tiny.x0).toBeCloseTo(MIN_SIDE)
  })
  it('keeps the grid in building-local metres, also for odd building sizes', () => {
    const b = { x0: -5.17, x1: 5.17, z0: -4, z1: 4 }
    const r = dragRect({ x0: -5.17, x1: -2.17, z0: -4, z1: -1 }, 'move', 1.02, 0, [], b)
    expect(Math.round((r.x0 - b.x0) * 1000) % 50).toBe(0)
  })
  it('explains why a position is not allowed', () => {
    expect(rectProblem(room, [{ rect: other, name: 'Kitchen' }], bounds)).toBeNull()
    expect(rectProblem({ x0: 0, x1: 3, z0: -4, z1: -1 }, [{ rect: other, name: 'Kitchen' }], bounds)).toBe('It would overlap "Kitchen".')
    expect(rectProblem({ x0: 3, x1: 6, z0: 1, z1: 3 }, [], bounds)).toBe('It must stay inside the building.')
    expect(rectProblem({ x0: 0, x1: 0.3, z0: 0, z1: 2 }, [], bounds)).toMatch(/at least/)
    // just touching (sharing a wall) is fine
    expect(rectProblem({ x0: -3, x1: 1, z0: -4, z1: -1 }, [{ rect: other, name: 'Kitchen' }], bounds)).toBeNull()
  })
})
