/**
 * Undo / redo for the Studio. Each step knows how to undo and redo itself (a layout snapshot swap, or a room
 * update sent to the server). Steps run one at a time; a failing step stays where it was.
 */
import { useCallback, useRef, useState } from 'react'

export interface Step {
  label: string
  undo: () => void | Promise<void>
  redo: () => void | Promise<void>
}

export const HISTORY_LIMIT = 50

/** Plain undo / redo stacks (no React), so the rules are easy to test. */
export class History {
  past: Step[] = []
  future: Step[] = []
  constructor(private limit = HISTORY_LIMIT) {}
  push(s: Step) {
    this.past.push(s)
    if (this.past.length > this.limit) this.past.shift()
    this.future = [] // a new change ends the redo chain
  }
  /** Runs the undo of the latest step; on success it moves to the redo stack. */
  async undo(): Promise<Step | null> {
    const s = this.past[this.past.length - 1]
    if (!s) return null
    await s.undo()
    this.past.pop()
    this.future.push(s)
    return s
  }
  async redo(): Promise<Step | null> {
    const s = this.future[this.future.length - 1]
    if (!s) return null
    await s.redo()
    this.future.pop()
    this.past.push(s)
    return s
  }
  clear() { this.past = []; this.future = [] }
}

export interface HistoryApi {
  push: (s: Step) => void
  undo: () => Promise<Step | null>
  redo: () => Promise<Step | null>
  clear: () => void
  canUndo: boolean
  canRedo: boolean
  busy: boolean
  undoLabel: string | null
  redoLabel: string | null
}

export function useHistory(onError?: (e: unknown) => void): HistoryApi {
  const h = useRef(new History())
  const [, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const bump = () => setVersion((v) => v + 1)
  const push = useCallback((s: Step) => { h.current.push(s); bump() }, [])
  const clear = useCallback(() => { h.current.clear(); bump() }, [])
  const run = useCallback(async (which: 'undo' | 'redo') => {
    if (busyRef.current) return null
    busyRef.current = true; setBusy(true)
    try { return await h.current[which]() } catch (e) { onError?.(e); return null } finally { busyRef.current = false; setBusy(false); bump() }
  }, [onError])
  const past = h.current.past, future = h.current.future
  return {
    push, clear, undo: () => run('undo'), redo: () => run('redo'),
    canUndo: past.length > 0, canRedo: future.length > 0, busy,
    undoLabel: past[past.length - 1]?.label ?? null, redoLabel: future[future.length - 1]?.label ?? null,
  }
}
