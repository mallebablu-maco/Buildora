import '@fontsource-variable/space-grotesk/wght.css'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import duskHouse from '@/assets/home/dusk-house.jpg'
import { authMessage } from './errors'

/**
 * Sign-in screens: a real house photo with the tagline on the left (wide screens only), the form on the right.
 * On phones only the form shows, under the logo, as before.
 */
export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[46%] shrink-0 overflow-hidden bg-navy-950 lg:block">
        <img src={duskHouse} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,20,42,0.75),rgba(7,20,42,0.25)_40%,rgba(7,20,42,0.92))]" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
          <Link to="/" aria-label="Buildora home" className="self-start"><Logo dark /></Link>
          <div className="flex flex-col gap-2">
            <p className="font-display text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">Plan smarter.<br /><span className="text-brand-500">Build better.</span></p>
            <p className="text-[15px] text-slate-300">Your projects, 3D models and estimates are waiting.</p>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <Link to="/" aria-label="Buildora home" className="mb-8 lg:hidden"><Logo /></Link>
        <div className={wide ? 'w-full max-w-lg' : 'w-full max-w-md'}>
          <h1 className="font-display text-3xl font-bold tracking-tight text-navy-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        <Link to="/" className="mt-8 inline-flex items-center gap-1.5 text-sm text-slate-600 underline underline-offset-2 hover:text-navy-900">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to home
        </Link>
      </main>
    </div>
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
