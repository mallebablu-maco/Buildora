import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthShell } from './AuthShell'
import { authMessage } from './errors'
import { GoogleButton, OrDivider } from './GoogleButton'
import { loginSchema, type LoginValues } from './schemas'
import { useAuth } from './useAuth'

export default function LoginPage() {
  const { session, signIn } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', keep: true },
  })

  if (session) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async ({ email, password, keep }) => {
    setError(null)
    try {
      await signIn(email, password, keep) // the session appearing redirects us (see above)
    } catch (e) {
      setError(authMessage(e))
    }
  })

  return (
    <AuthShell title="Log in" subtitle="Continue with your saved projects and estimates.">
      <GoogleButton />
      <Link to="/login/code" className="mt-2 flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">Email me a login code</Link>
      <OrDivider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" aria-describedby={describedBy} invalid={invalid} {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message} action={<Link to="/forgot-password" className="text-sm text-navy-700 underline underline-offset-2">Forgot password?</Link>}>
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="current-password" placeholder="Your password" aria-describedby={describedBy} invalid={invalid} {...register('password')} />}
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" {...register('keep')} /> Keep me logged in
        </label>
        <Button type="submit" variant="accent" className="w-full" loading={isSubmitting}>Log in</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        New to Buildora? <Link to="/signup" className="font-medium text-navy-700 underline underline-offset-2">Create an account</Link>
      </p>
    </AuthShell>
  )
}
