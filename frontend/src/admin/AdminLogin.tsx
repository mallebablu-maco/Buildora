import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/field'
import { AuthShell, SigningIn, useAuthRedirect } from '@/features/auth/AuthShell'
import { authMessage } from '@/features/auth/errors'
import { GoogleButton, OrDivider } from '@/features/auth/GoogleButton'
import { PasswordInput } from '@/features/auth/PasswordInput'
import { loginSchema, type LoginValues } from '@/features/auth/schemas'
import { useAuth } from '@/features/auth/useAuth'

/** The admin website's own login: the same Buildora account, but only Admins get past the gate. No sign-up here. */
export default function AdminLogin() {
  const { session, loading, signIn } = useAuth()
  const redirect = useAuthRedirect(!!session)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', keep: true },
  })
  if (session) return <Navigate to="/" replace />
  if (loading || redirect.waiting) return <SigningIn />
  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null)
    try { await signIn(email, password, true) } catch (e) { setError(authMessage(e)) }
  })
  return (
    <AuthShell title="Buildora Admin" subtitle="For the website owner and team only.">
      <GoogleButton />
      <OrDivider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {(error ?? redirect.error) && <Alert tone="error">{error ?? redirect.error}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" aria-describedby={describedBy} invalid={invalid} {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {({ id, describedBy, invalid }) => <PasswordInput id={id} autoComplete="current-password" aria-describedby={describedBy} invalid={invalid} {...register('password')} />}
        </Field>
        <Button type="submit" variant="accent" className="w-full" loading={isSubmitting}>Log in</Button>
      </form>
    </AuthShell>
  )
}
