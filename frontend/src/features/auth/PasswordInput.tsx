import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof Input>, 'type'> & {
  /** Refuse pasting and dropping text (the "Confirm password" box must be typed). Called when someone tries. */
  onBlockedPaste?: () => void
  /** Refuse copying or cutting the typed password out of this box. */
  noCopy?: boolean
}

/** A password box with an eye button that shows or hides what was typed. */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput({ className, onBlockedPaste, noCopy, ...props }, ref) {
  const [shown, setShown] = useState(false)
  const block = (e: { preventDefault: () => void }) => { e.preventDefault(); onBlockedPaste?.() }
  const blockCopy = noCopy ? { onCopy: (e: { preventDefault: () => void }) => e.preventDefault(), onCut: (e: { preventDefault: () => void }) => e.preventDefault() } : {}
  return (
    <div className="relative">
      <Input ref={ref} type={shown ? 'text' : 'password'} className={cn('pr-10', className)} {...props}
        {...(onBlockedPaste ? { onPaste: block, onDrop: block } : {})} {...blockCopy} />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-slate-500 hover:text-navy-900">
        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  )
})
