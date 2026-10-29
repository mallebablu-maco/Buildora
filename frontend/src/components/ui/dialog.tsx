import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

/** Confirmation before something that cannot be undone. Escape or the Cancel button closes it; focus starts on Cancel. */
export function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', busy = false, loading, onConfirm, onCancel, onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel?: () => void
  onClose?: () => void
}) {
  busy = busy || !!loading
  const cancel = onCancel ?? onClose ?? (() => {})
  const titleId = useId()
  const textId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) cancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, cancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) cancel() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-semibold text-navy-900">{title}</h2>
        <p id={textId} className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button ref={cancelRef} variant="outline" disabled={busy} onClick={cancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}


/** A general modal built on the browser's <dialog>: focus is trapped inside, Escape and a click outside close it. */
export function Dialog({ open, onClose, title, description, children, className }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={cn('m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border-0 p-0 shadow-2xl backdrop:bg-navy-950/50', className)}>
      {open && (
        <div>
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  )
}
