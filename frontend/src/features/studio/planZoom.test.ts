import { describe, expect, it } from 'vitest'
import { MAX_ZOOM, toPlanPoint, zoomAt, zoomedView } from './planZoom'

const base = { x: -8, y: -6, w: 16, h: 12 }
const box = { left: 100, top: 50, width: 800, height: 600 }

describe('2D plan zoom', () => {
  it('no zoom = the whole plan', () => {
    expect(zoomedView(base, null)).toEqual(base)
    expect(zoomedView(base, { k: 1, cx: 3, cy: 3 })).toEqual(base)
  })
  it('screen <-> plan mapping matches the SVG fit', () => {
    expect(toPlanPoint(base, box, 500, 350)).toEqual([0, 0]) // centre
    expect(toPlanPoint(base, box, 100, 50)).toEqual([-8, -6]) // top-left
  })
  it('pinch keeps the point between the fingers under the fingers', () => {
    const p = toPlanPoint(base, box, 300, 200)
    const z = zoomAt(base, box, 3, p, 300, 200)
    const after = toPlanPoint(zoomedView(base, z), box, 300, 200)
    expect(after[0]).toBeCloseTo(p[0], 9); expect(after[1]).toBeCloseTo(p[1], 9)
  })
  it('zoom stays between 100% and the maximum, and never shows space outside the plan', () => {
    expect(zoomAt(base, box, 0.2, [0, 0], 500, 350).k).toBe(1)
    expect(zoomAt(base, box, 100, [0, 0], 500, 350).k).toBe(MAX_ZOOM)
    const v = zoomedView(base, { k: 4, cx: 1000, cy: -1000 })
    expect(v.x + v.w).toBeCloseTo(base.x + base.w); expect(v.y).toBeCloseTo(base.y)
  })
})
