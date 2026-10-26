import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthShell } from './AuthShell'
import { authMessage } from './errors'
import { forgotSchema, type ForgotValues } from './schemas'
import { useAuth } from './useAuth'

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (e) {
      setError(authMessage(e))
    }
  })

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new password.">
      {sent ? (
        <div className="space-y-4">
          {/* Same message whether or not the address has an account, so the form cannot be used to find out who is registered. */}
          <Alert tone="success">If an account exists for that address, a reset link is on its way. It can take a few minutes.</Alert>
          <Link to="/login" className="inline-block text-sm font-medium text-navy-700 underline underline-offset-2">Back to log in</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" error={errors.email?.message}>
            {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" aria-describedby={describedBy} invalid={invalid} {...register('email')} />}
          </Field>
          <Button type="submit" variant="accent" className="w-full" loading={isSubmitting}>Send reset link</Button>
          <p className="text-center text-sm"><Link to="/login" className="text-navy-700 underline underline-offset-2">Back to log in</Link></p>
        </form>
      )}
    </AuthShell>
  )
}
