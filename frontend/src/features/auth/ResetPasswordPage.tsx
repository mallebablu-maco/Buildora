import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Spinner } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthShell } from './AuthShell'
import { authMessage } from './errors'
import { resetSchema, type ResetValues } from './schemas'
import { useAuth } from './useAuth'

/** Landing page of the emailed reset link. supabase-js turns the link into a (recovery) session before this renders the form. */
export default function ResetPasswordPage() {
  const { session, loading, recovery, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } })

  if (loading) return <Spinner label="Checking your link…" className="min-h-screen" />

  if (!session && !recovery) {
    return (
      <AuthShell title="This link is not valid">
        <div className="space-y-4">
          <Alert tone="warning">The reset link is invalid or has expired. Links can only be used once.</Alert>
          <Link to="/forgot-password" className="inline-block text-sm font-medium text-navy-700 underline underline-offset-2">Request a new link</Link>
        </div>
      </AuthShell>
    )
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try {
      await updatePassword(password)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(authMessage(e))
    }
  })

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" error={errors.password?.message} hint="Use 8 or more characters.">
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...register('password')} />}
        </Field>
        <Field label="Confirm new password" error={errors.confirm?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={describedBy} invalid={invalid} {...register('confirm')} />}
        </Field>
        <Button type="submit" variant="accent" className="w-full" loading={isSubmitting}>Save new password</Button>
      </form>
    </AuthShell>
  )
}
