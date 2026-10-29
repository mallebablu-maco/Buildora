import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { withNumberGuard } from './form'

export function Input({ className, invalid, ...props }: ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100',
        invalid ? 'border-red-500' : 'border-slate-300', className,
      )}
      {...withNumberGuard(props)}
    />
  )
}

export function Select({ className, invalid, ...props }: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        'h-9 w-full rounded-md border bg-white px-3 text-sm text-slate-800 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100',
        invalid ? 'border-red-500' : 'border-slate-300', className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, invalid, ...props }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100',
        invalid ? 'border-red-500' : 'border-slate-300', className,
      )}
      {...props}
    />
  )
}

/**
 * Label + control + error/hint, wired together for screen readers. `children` receives the ids to put on the input.
 * The grey hint shows only while the person is typing in the box (`hintAlways` keeps it visible, e.g. under a disabled box);
 * the red error shows whenever there is one.
 */
export function Field({
  label, error, hint, hintAlways = false, action, children,
}: {
  label: string
  error?: string
  hint?: string
  hintAlways?: boolean
  action?: ReactNode
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="group space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
        {action}
      </div>
      {children({ id, describedBy, invalid: !!error })}
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p>
        : hint ? <p id={`${id}-hint`} className={cn('text-sm text-slate-500', !hintAlways && 'hidden group-focus-within:block')}>{hint}</p> : null}
    </div>
  )
}
