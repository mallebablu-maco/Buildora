import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Alert } from '@/components/ui/feedback'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthShell } from './AuthShell'
import { authMessage } from './errors'
import { GoogleButton, OrDivider } from './GoogleButton'
import { useAuth } from './useAuth'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_AFTER = 60 // seconds; Supabase refuses a new code sooner anyway

/** Log in (or sign up) without a password: we email a one-time code; typing it, or clicking the link in the email, signs you in. */
export default function LoginCodePage() {
  const { session, sendLoginCode, verifyLoginCode } = useAuth()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  if (session) return <Navigate to="/dashboard" replace />

  const emailError = email.trim() === '' ? null : EMAIL.test(email.trim()) ? null : 'Enter a valid email address.'
  const codeError = code === '' ? null : /^\d{6,10}$/.test(code) ? null : 'The code is 6 digits.'

  const send = async (to: string) => {
    setError(null); setBusy(true)
    try { await sendLoginCode(to); setSentTo(to); setCode(''); setWait(RESEND_AFTER) } catch (e) { setError(authMessage(e)) } finally { setBusy(false) }
  }
  const verify = async () => {
    if (!sentTo) return
    setError(null); setBusy(true)
    try { await verifyLoginCode(sentTo, code) } catch (e) { setError(authMessage(e)); setBusy(false) } // on success the session redirects
  }

  return (
    <AuthShell title="Log in with a code" subtitle={sentTo ? undefined : 'No password needed. We email you a one-time code. New here? This also creates your account.'}>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {!sentTo ? (
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (email.trim() && !emailError) void send(email.trim()) }}>
          <Field label="Email" error={emailError ?? undefined}>
            {({ id, describedBy, invalid }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} invalid={invalid} />}
          </Field>
          <Button type="submit" variant="accent" className="w-full" loading={busy} disabled={!email.trim() || !!emailError}>Email me a code</Button>
        </form>
      ) : (
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (code && !codeError) void verify() }}>
          <Alert tone="success">We sent a code to <strong>{sentTo}</strong>. It can take a minute; check spam too. You can also just click the link in that email.</Alert>
          <Field label="Code from the email" error={codeError ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-describedby={describedBy} invalid={invalid} className="tracking-[0.3em]" />
            )}
          </Field>
          <Button type="submit" variant="accent" className="w-full" loading={busy} disabled={!code || !!codeError}>Log in</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="cursor-pointer text-navy-700 underline underline-offset-2" onClick={() => { setSentTo(null); setError(null) }}>Use a different email</button>
            <button type="button" className="cursor-pointer text-navy-700 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline" disabled={wait > 0 || busy} onClick={() => void send(sentTo)}>
              {wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}
            </button>
          </div>
        </form>
      )}
      <OrDivider />
      <GoogleButton />
      <p className="mt-5 text-center text-sm text-slate-600">
        Prefer a password? <Link to="/login" className="font-medium text-navy-700 underline underline-offset-2">Log in with password</Link>
      </p>
    </AuthShell>
  )
}
