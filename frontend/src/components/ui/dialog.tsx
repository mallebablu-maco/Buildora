import { useEffect, useId, useRef } from 'react'
import { Button } from './button'

/** Confirmation before something that cannot be undone. Escape or the Cancel button closes it; focus starts on Cancel. */
export function ConfirmDialog({
  open, title, message, confirmLabel, busy = false, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  const textId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 id={titleId} className="text-lg font-bold text-navy-900">{title}</h2>
        <p id={textId} className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-navy-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-900 disabled:opacity-60">Cancel</button>
          <Button onClick={onConfirm} loading={busy} className="bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700">{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
