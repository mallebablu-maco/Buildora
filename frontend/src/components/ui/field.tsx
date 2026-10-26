import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, invalid, ...props }: ComponentProps<'input'> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-offset-1 focus:outline-navy-900',
        invalid ? 'border-red-500' : 'border-slate-300', className,
      )}
      {...props}
    />
  )
}

/** Label + control + error/hint, wired together for screen readers. `children` receives the ids to put on the input. */
export function Field({
  label, error, hint, action, children,
}: {
  label: string
  error?: string
  hint?: string
  action?: ReactNode
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-navy-900">{label}</label>
        {action}
      </div>
      {children({ id, describedBy, invalid: !!error })}
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p>
        : hint ? <p id={`${id}-hint`} className="text-sm text-slate-500">{hint}</p> : null}
    </div>
  )
}
