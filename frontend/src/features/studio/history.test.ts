import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { History, HISTORY_LIMIT, useHistory } from './history'

const counter = () => {
  let v = 0
  const step = (label: string, d: number) => ({ label, undo: () => { v -= d }, redo: () => { v += d } })
  return { get: () => v, apply: (h: History, label: string, d: number) => { v += d; h.push(step(label, d)) } }
}

describe('undo / redo', () => {
  it('undoes and redoes in order', async () => {
    const h = new History(), c = counter()
    c.apply(h, 'a', 1); c.apply(h, 'b', 10)
    expect((await h.undo())?.label).toBe('b'); expect(c.get()).toBe(1)
    expect((await h.undo())?.label).toBe('a'); expect(c.get()).toBe(0)
    expect(await h.undo()).toBeNull()
    await h.redo(); await h.redo(); expect(c.get()).toBe(11)
    expect(await h.redo()).toBeNull()
  })
  it('a new change after undo drops the redo steps', async () => {
    const h = new History(), c = counter()
    c.apply(h, 'a', 1); c.apply(h, 'b', 10)
    await h.undo()
    c.apply(h, 'c', 100)
    expect(h.future).toHaveLength(0)
    expect(await h.redo()).toBeNull()
    expect(c.get()).toBe(101)
  })
  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    const h = new History(), c = counter()
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) c.apply(h, `s${i}`, 1)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0].label).toBe('s10')
  })
  it('a step that fails (e.g. the server refuses) stays where it was', async () => {
    const h = new History()
    h.push({ label: 'x', undo: () => { throw new Error('offline') }, redo: () => {} })
    await expect(h.undo()).rejects.toThrow('offline')
    expect(h.past).toHaveLength(1)
    expect(h.future).toHaveLength(0)
  })
  it('hook: reports what can be undone and passes errors on', async () => {
    const errors: unknown[] = []
    const { result } = renderHook(() => useHistory((e) => errors.push(e)))
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.push({ label: 'furniture change', undo: () => { throw new Error('no') }, redo: () => {} }))
    expect(result.current.canUndo).toBe(true)
    expect(result.current.undoLabel).toBe('furniture change')
    await act(async () => { await result.current.undo() })
    expect(errors).toHaveLength(1)
    expect(result.current.canUndo).toBe(true)
    act(() => result.current.clear())
    expect(result.current.canUndo).toBe(false)
  })
})
