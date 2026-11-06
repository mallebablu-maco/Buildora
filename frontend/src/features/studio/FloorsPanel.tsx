import { Copy, Eraser, Layers } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { LIMITS } from '@/lib/limits'
import { cn } from '@/lib/utils'
import type { Room, RoomInput } from '@/types'
import { clearFloor, copyFloor, floorSummaries } from './floorOps'

/** Per-floor overview with "copy this floor to…" and "clear floor". `onReplace` saves the full new room list. */
export function FloorsPanel({ rooms, floors, onReplace, onShowFloor, area }: {
  rooms: Room[]; floors: number; onReplace: (rooms: RoomInput[], message: string) => Promise<void>; onShowFloor: (floor: number) => void
  area: (m2: number) => string
}) {
  const [copyFrom, setCopyFrom] = useState<number | null>(null)
  const [targets, setTargets] = useState<number[]>([])
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; run: () => Promise<void> } | null>(null)
  const [busy, setBusy] = useState(false)
  const sums = floorSummaries(rooms, floors)
  if (floors < 2) return null

  const startCopy = (fl: number) => { setCopyFrom(copyFrom === fl ? null : fl); setTargets(sums.filter((s) => s.floor !== fl && s.rooms === 0).map((s) => s.floor)) }
  const toggle = (fl: number) => setTargets((t) => (t.includes(fl) ? t.filter((x) => x !== fl) : [...t, fl]))
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false); setConfirm(null) } }

  const askCopy = () => {
    if (copyFrom == null || !targets.length) return
    const next = copyFloor(rooms, copyFrom, targets)
    const src = sums[copyFrom - 1].rooms
    const replaced = sums.filter((s) => targets.includes(s.floor)).reduce((n, s) => n + s.rooms, 0)
    const list = [...targets].sort((a, b) => a - b).join(', ')
    if (next.length > LIMITS.MAX_ROOMS) {
      setConfirm({ title: 'Too many rooms', label: 'OK', message: `That would make ${next.length} rooms; a project can have at most ${LIMITS.MAX_ROOMS}. Choose fewer floors.`, run: async () => {} })
      return
    }
    setConfirm({
      title: `Copy floor ${copyFrom}?`, label: 'Copy',
      message: `Floor${targets.length > 1 ? 's' : ''} ${list} will get a copy of floor ${copyFrom} (${src} room${src === 1 ? '' : 's'}).${replaced ? ` ${replaced} room${replaced === 1 ? '' : 's'} already there will be replaced.` : ''} Undo history starts fresh after this.`,
      run: async () => { await onReplace(next, `Floor ${copyFrom} copied to floor${targets.length > 1 ? 's' : ''} ${list}.`); setCopyFrom(null) },
    })
  }
  const askClear = (fl: number) => setConfirm({
    title: `Clear floor ${fl}?`, label: 'Clear floor',
    message: `All ${sums[fl - 1].rooms} rooms on floor ${fl} will be removed. Other floors stay as they are. Undo history starts fresh after this.`,
    run: () => onReplace(clearFloor(rooms, fl), `Floor ${fl} cleared.`),
  })

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Layers className="h-4 w-4 text-orange-600" /> Floors</span>}
        description="Copy a whole floor onto other floors, or clear one." />
      <CardBody className="space-y-2 p-3 text-sm">
        {sums.map((s) => (
          <div key={s.floor} className={cn('rounded-md border px-2.5 py-2', copyFrom === s.floor ? 'border-orange-300 bg-orange-50/60' : 'border-slate-200')}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onShowFloor(s.floor)} className="min-w-0 flex-1 text-left" title={`Show floor ${s.floor}`}>
                <span className="font-medium text-navy-900">Floor {s.floor}</span>
                <span className="ml-2 text-xs text-slate-500">{s.rooms ? `${s.rooms} room${s.rooms === 1 ? '' : 's'} · ${area(s.area)}` : 'empty'}</span>
              </button>
              <Button size="sm" variant="outline" disabled={!s.rooms || busy} onClick={() => startCopy(s.floor)} aria-label={`Copy floor ${s.floor}`}><Copy className="h-3.5 w-3.5" /> Copy</Button>
              <Button size="sm" variant="ghost" disabled={!s.rooms || busy} onClick={() => askClear(s.floor)} aria-label={`Clear floor ${s.floor}`} title="Clear floor"><Eraser className="h-3.5 w-3.5" /></Button>
            </div>
            {copyFrom === s.floor && (
              <div className="mt-2 space-y-2 border-t border-orange-200 pt-2">
                <div className="text-xs text-slate-600">Copy to:</div>
                <div className="flex flex-wrap gap-1.5">
                  {sums.filter((o) => o.floor !== s.floor).map((o) => (
                    <label key={o.floor} className={cn('inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs', targets.includes(o.floor) ? 'border-orange-500 bg-white text-orange-700' : 'border-slate-300 bg-white text-slate-600')}>
                      <input type="checkbox" className="accent-orange-600" checked={targets.includes(o.floor)} onChange={() => toggle(o.floor)} />
                      Floor {o.floor}{o.rooms ? '' : ' (empty)'}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="accent" disabled={!targets.length || busy} onClick={askCopy}>Copy to {targets.length || ''} floor{targets.length === 1 ? '' : 's'}</Button>
                  <Button size="sm" variant="outline" onClick={() => setCopyFrom(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardBody>
      <ConfirmDialog open={!!confirm} title={confirm?.title ?? ''} message={confirm?.message ?? ''} confirmLabel={confirm?.label} loading={busy}
        onConfirm={() => confirm && (confirm.label === 'OK' ? setConfirm(null) : run(confirm.run))} onClose={() => !busy && setConfirm(null)} />
    </Card>
  )
}
