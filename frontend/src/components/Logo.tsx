import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0b1f3a" />
      <path d="M8 24V14.5L16 8l8 6.5V24h-5v-6h-6v6z" fill="none" stroke="#f58a1f" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-lg font-bold tracking-tight', dark ? 'text-white' : 'text-navy-900', className)}>
      <LogoMark />
      Buildora
    </span>
  )
}
