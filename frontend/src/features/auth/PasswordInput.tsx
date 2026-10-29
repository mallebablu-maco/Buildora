import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/** A password box with an eye button that shows or hides what was typed. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, 'type'>>(function PasswordInput({ className, ...props }, ref) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-slate-500 hover:text-navy-900">
        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  )
})
