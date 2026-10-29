import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { numberKeyGuard } from '@/lib/numberInput'
import { cn } from '@/lib/utils'

const base = 'w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => (
  <input ref={ref} aria-invalid={invalid || undefined} className={cn(base, 'h-9', invalid && 'border-red-400', className)} {...withNumberGuard(p)} />
))

/** Number boxes refuse letters such as "e" (see numberKeyGuard); the caller's own key/paste handlers still run. */
function withNumberGuard<T extends InputHTMLAttributes<HTMLInputElement>>(p: T): T {
  if (p.type !== 'number') return p
  const g = numberKeyGuard(p.min)
  return {
    inputMode: 'decimal', ...p,
    onKeyDown: (e) => { g.onKeyDown(e); if (!e.defaultPrevented) p.onKeyDown?.(e) },
    onPaste: (e) => { g.onPaste(e); if (!e.defaultPrevented) p.onPaste?.(e) },
  }
}
export { withNumberGuard }
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-20 py-2', className)} {...p} />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(base, 'h-9 pr-8', className)} {...p} />
))
Select.displayName = 'Select'

/**
 * Message for under a plain box (table cells, inline editors): the problem in red, or the allowed range as a grey hint.
 * The hint shows only while the person is typing in that box: put `group` on the element that holds both box and message.
 */
export function Under({ error, hint, className }: { error?: string | null; hint?: string; className?: string }) {
  if (error) return <p role="alert" className={cn('mt-1 text-xs text-red-600', className)}>{error}</p>
  return hint ? <p className={cn('mt-1 hidden text-xs text-slate-500 group-focus-within:block', className)}>{hint}</p> : null
}

/** Label + box + message. The grey hint shows only while typing in the box (`hintAlways` keeps it visible); the red error always. */
export function Field({ label, error, hint, hintAlways = false, children, className }: { label: string; error?: string | null; hint?: string; hintAlways?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn('group block', className)}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
        {children}
      </label>
      {hint && !error && <p className={cn('mt-1 text-xs text-slate-500', !hintAlways && 'hidden group-focus-within:block')}>{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
