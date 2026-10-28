import { ArrowLeft, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Card } from '@/components/ui/card'
import { authMessage } from './errors'

/** Centered card on the engineering-paper grid, shared by every sign-in screen. */
export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="bg-grid flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" aria-label="Buildora home" className="mb-6"><Logo /></Link>
      <Card className={wide ? 'w-full max-w-lg p-6 sm:p-8' : 'w-full max-w-md p-6 sm:p-8'}>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-slate-600 underline underline-offset-2 hover:text-navy-900">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to home
      </Link>
    </main>
  )
}

/** Shown instead of a form while Supabase finishes a login that just came back from Google or an email link. */
export function SigningIn() {
  return (
    <main className="bg-grid flex min-h-screen flex-col items-center justify-center gap-4 px-4" role="status" aria-live="polite">
      <Logo />
      <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-brand-500" aria-hidden="true" /> Signing you in…</p>
    </main>
  )
}

const GIVE_UP_AFTER_MS = 10_000

/**
 * Google and the email link send people back with the result in the address (a session, or an error). Read it once, before
 * Supabase tidies the address, so the page can show "Signing you in…" instead of flashing the form, or explain a failed link.
 */
export function useAuthRedirect(sessionArrived: boolean) {
  const [{ arriving, error }] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const query = new URLSearchParams(window.location.search)
    const err = hash.get('error_description') ?? query.get('error_description')
    return { arriving: !err && (hash.has('access_token') || query.has('code')), error: err ? authMessage(err.replace(/\+/g, ' ')) : null }
  })
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (error) window.history.replaceState(null, '', window.location.pathname) // drop the error from the address bar
    if (!arriving) return
    const t = setTimeout(() => setTimedOut(true), GIVE_UP_AFTER_MS)
    return () => clearTimeout(t)
  }, [arriving, error])
  return {
    waiting: arriving && !sessionArrived && !timedOut,
    error: error ?? (timedOut && !sessionArrived ? 'The sign-in did not finish. Please try again.' : null),
  }
}
