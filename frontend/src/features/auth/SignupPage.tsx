import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { AuthShell, SigningIn, useAuthRedirect } from './AuthShell'
import { GoogleButton, OrDivider } from './GoogleButton'
import { authMessage } from './errors'
import { PERSONAS, signupSchema, type SignupValues } from './schemas'
import { useAuth } from './useAuth'

const RESEND_AFTER = 60 // seconds; Supabase refuses another email sooner anyway

export default function SignupPage() {
  const { session, loading, signUp } = useAuth()
  const redirect = useAuthRedirect(!!session)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const [wait, setWait] = useState(0)
  const [resending, setResending] = useState(false)
  const { register, handleSubmit, watch, getValues, formState: { errors, isSubmitting } } = useForm<SignupValues>({
    mode: 'onChange',
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: '', persona: 'homeowner', acceptDisclaimer: false },
  })
  const persona = watch('persona')

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  if (session) return <Navigate to="/dashboard" replace />
  if (loading || redirect.waiting) return <SigningIn />

  if (confirmEmail) {
    const resend = async () => {
      setError(null); setResending(true)
      try { const v = getValues(); await signUp({ fullName: v.fullName, email: confirmEmail, persona: v.persona }); setWait(RESEND_AFTER) } catch (e) { setError(authMessage(e)) } finally { setResending(false) }
    }
    return (
      <AuthShell title="Check your email">
        <div className="space-y-4 text-sm text-slate-700">
          <MailCheck className="h-8 w-8 text-brand-600" aria-hidden="true" />
          {error && <Alert tone="error">{error}</Alert>}
          <p>We sent an email to <strong>{confirmEmail}</strong>. Click <strong>Confirm your email</strong> in it, then choose your password.</p>
          <p className="text-slate-500">It can take a minute. Nothing arrived? Check your spam folder, or send it again.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" loading={resending} disabled={wait > 0} onClick={() => void resend()}>{wait > 0 ? `Send again in ${wait}s` : 'Send the email again'}</Button>
            <button type="button" className="cursor-pointer text-navy-700 underline underline-offset-2" onClick={() => { setConfirmEmail(null); setError(null) }}>Use a different email</button>
          </div>
        </div>
      </AuthShell>
    )
  }

  const onSubmit = handleSubmit(async ({ fullName, email, persona }) => {
    setError(null)
    try {
      await signUp({ fullName, email, persona })
      setConfirmEmail(email)
      setWait(RESEND_AFTER)
    } catch (e) {
      setError(authMessage(e))
    }
  })

  return (
    <AuthShell title="Create your account" subtitle="Save projects, keep your own material rates and download reports. You choose your password after confirming your email." wide>
      <GoogleButton />
      <Link to="/login/code" className="mt-2 flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">Sign up with an email link (no password)</Link>
      <OrDivider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {(error ?? redirect.error) && <Alert tone="error">{error ?? redirect.error}</Alert>}
        <Field label="Full name" error={errors.fullName?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} autoComplete="name" maxLength={60} placeholder="Your name" aria-describedby={describedBy} invalid={invalid} {...register('fullName')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" aria-describedby={describedBy} invalid={invalid} {...register('email')} />}
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
