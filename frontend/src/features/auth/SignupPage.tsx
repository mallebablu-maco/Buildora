import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { AuthShell } from './AuthShell'
import { authMessage } from './errors'
import { PERSONAS, signupSchema, type SignupValues } from './schemas'
import { useAuth } from './useAuth'

export default function SignupPage() {
  const { session, signUp } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', password: '', persona: 'homeowner', acceptDisclaimer: false },
  })
  const persona = watch('persona')

  if (session) return <Navigate to="/dashboard" replace />

  if (confirmEmail) {
    return (
      <AuthShell title="Check your email">
        <div className="space-y-4 text-sm text-slate-700">
          <MailCheck className="h-8 w-8 text-brand-600" aria-hidden="true" />
          <p>We sent a confirmation link to <strong>{confirmEmail}</strong>. Open it, then come back and log in.</p>
          <p className="text-slate-500">Nothing arrived? Check your spam folder. If this address was already registered, you can log in or reset the password.</p>
          <Link to="/login" className="inline-block font-medium text-navy-700 underline underline-offset-2">Go to log in</Link>
        </div>
      </AuthShell>
    )
  }

  const onSubmit = handleSubmit(async ({ fullName, email, password, persona }) => {
    setError(null)
    try {
      const { needsEmailConfirmation } = await signUp({ fullName, email, password, persona })
      if (needsEmailConfirmation) setConfirmEmail(email)
      // otherwise a session now exists and the redirect above takes over
    } catch (e) {
      setError(authMessage(e))
    }
  })

  return (
    <AuthShell title="Create your account" subtitle="Save projects, keep your own material rates and download reports." wide>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name" error={errors.fullName?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} autoComplete="name" placeholder="Your name" aria-describedby={describedBy} invalid={invalid} {...register('fullName')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" aria-describedby={describedBy} invalid={invalid} {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="Use 8 or more characters.">
          {({ id, describedBy, invalid }) => <Input id={id} type="password" autoComplete="new-password" placeholder="At least 8 characters" aria-describedby={describedBy} invalid={invalid} {...register('password')} />}
        </Field>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-navy-900">I am a…</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERSONAS.map((p) => (
              <label key={p.value} className={cn('cursor-pointer rounded-lg border p-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-navy-900', persona === p.value ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:bg-slate-50')}>
                <input type="radio" value={p.value} className="sr-only" {...register('persona')} />
                <span className="block font-semibold text-navy-900">{p.title}</span>
                <span className="block text-slate-600">{p.description}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" aria-describedby={errors.acceptDisclaimer ? 'disclaimer-error' : undefined} {...register('acceptDisclaimer')} />
            I understand estimates are for preliminary planning and must be verified by a qualified engineer.
          </label>
          {errors.acceptDisclaimer && <p id="disclaimer-error" role="alert" className="mt-1 text-sm text-red-700">{errors.acceptDisclaimer.message}</p>}
        </div>

        <Button type="submit" variant="accent" className="w-full" loading={isSubmitting}>Create account</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account? <Link to="/login" className="font-medium text-navy-700 underline underline-offset-2">Log in</Link>
      </p>
    </AuthShell>
  )
}
