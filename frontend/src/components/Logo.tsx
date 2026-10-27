import { cn } from '@/lib/utils'

export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8 shrink-0', className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill={light ? '#ffffff' : '#0B1F3A'} />
      <path d="M7 24V13l9-6 9 6v11h-6v-7h-6v7z" fill="#F97316" />
    </svg>
  )
}

export function Logo({ className, dark = false, compact = false }: { className?: string; dark?: boolean; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-lg font-bold tracking-tight', dark ? 'text-white' : 'text-navy-900', className)}>
      <LogoMark light={dark} />
      {!compact && 'Buildora'}
    </span>
  )
}
