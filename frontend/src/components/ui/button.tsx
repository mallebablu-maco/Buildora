import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'accent' | 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  // Orange is reserved for the one primary action on a screen.
  accent: 'bg-brand-500 text-navy-900 hover:bg-brand-600 focus-visible:outline-navy-900',
  primary: 'bg-navy-900 text-white hover:bg-navy-800 focus-visible:outline-brand-500',
  outline: 'border border-slate-300 bg-white text-navy-900 hover:bg-slate-50 focus-visible:outline-navy-900',
  ghost: 'text-slate-700 hover:bg-slate-100 focus-visible:outline-navy-900',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700',
  'danger-outline': 'border border-red-300 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-700',
}
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-base', icon: 'h-8 w-8 p-0' }

export function Button({
  variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
