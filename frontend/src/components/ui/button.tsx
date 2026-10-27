import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'accent' | 'primary' | 'outline' | 'ghost' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
    accent: 'bg-brand-500 text-white hover:bg-brand-600',
  primary: 'bg-navy-900 text-white hover:bg-navy-800',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-outline': 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
}
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-9 px-4 text-sm', lg: 'h-11 px-6 text-base', icon: 'h-8 w-8 p-0' }

export function Button({
  variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
