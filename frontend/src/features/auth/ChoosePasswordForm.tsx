import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { authMessage } from './errors'
import { PasswordInput } from './PasswordInput'
import { resetSchema, type ResetValues } from './schemas'
import { useAuth } from './useAuth'

/** Password + Confirm password, each with a show/hide eye, checked as you type. Used after sign-up and after "Forgot password". */
export function ChoosePasswordForm({ submitLabel, onSaved }: { submitLabel: string; onSaved: () => void }) {
  const { updatePassword } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetValues>({
    mode: 'onChange', resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' },
  })
  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try { await updatePassword(password); onSaved() } catch (e) { setError(authMessage(e)) }
  })
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Password" error={errors.password?.message} hint="Use 8 or more characters.">
        {({ id, describedBy, invalid }) => <PasswordInput id={id} autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...register('password', { deps: ['confirm'] })} />}
      </Field>
      <Field label="Confirm password" error={errors.confirm?.message} hint="Type the same password again.">
        {({ id, describedBy, invalid }) => <PasswordInput id={id} autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...register('confirm')} />}
      </Field>
      <Button type="submit" variant="accent" className="w-full" loading={isSubmitting}>{submitLabel}</Button>
    </form>
  )
}
