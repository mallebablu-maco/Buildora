import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const base = 'w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => (
  <input ref={ref} aria-invalid={invalid || undefined} className={cn(base, 'h-9', invalid && 'border-red-400', className)} {...p} />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-20 py-2', className)} {...p} />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(base, 'h-9 pr-8', className)} {...p} />
))
Select.displayName = 'Select'

/** Message for under a plain box (table cells, inline editors): the problem in red, or the allowed range as a hint. */
export function Under({ error, hint, className }: { error?: string | null; hint?: string; className?: string }) {
  if (error) return <p role="alert" className={cn('mt-1 text-xs text-red-600', className)}>{error}</p>
  return hint ? <p className={cn('mt-1 text-xs text-slate-500', className)}>{hint}</p> : null
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string | null; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('block', className)}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
        {children}
      </label>
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
