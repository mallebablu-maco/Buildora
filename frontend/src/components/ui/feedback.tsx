import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Info, Loader2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

const tones = {
  error: { box: 'border-red-200 bg-red-50 text-red-900', Icon: XCircle },
  warning: { box: 'border-amber-300 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', Icon: Info },
}

export function Alert({ tone = 'info', title, children, className }: { tone?: keyof typeof tones; title?: string; children?: ReactNode; className?: string }) {
  const { box, Icon } = tones[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} />
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500">{icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}</span>
      <h3 className="text-base font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <AlertCircle className="mb-2 h-6 w-6 text-red-600" aria-hidden="true" />
      <p className="max-w-md text-sm text-red-800">{message}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

const badgeTones = {
  neutral: 'bg-slate-100 text-slate-700',
  navy: 'bg-navy-100 text-navy-800',
  orange: 'bg-brand-100 text-brand-700',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-800',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof badgeTones; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeTones[tone], className)}>{children}</span>
}

export const DISCLAIMER =
  'These are preliminary planning estimates based on rule-based calculations and the assumptions shown. They must be verified by a qualified engineer before procurement or construction.'

export function Disclaimer() {
  return <Alert tone="warning" title="Preliminary estimate">{DISCLAIMER}</Alert>
}
