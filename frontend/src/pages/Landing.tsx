import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/useAuth'

export default function Landing() {
  const { session } = useAuth()
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-2">
            {session ? (
              <Link to="/dashboard"><Button variant="accent" size="sm">Open dashboard</Button></Link>
            ) : (
              <>
                <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
                <Link to="/signup"><Button variant="accent" size="sm">Create account</Button></Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-700">Plan smarter. Build better.</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-navy-900 sm:text-5xl">
          Plan your building in 3D, then estimate what it takes to build it.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-600">
          Buildora turns your rooms into a 3D model and a material estimate from the same geometry, so every quantity can be traced back to the plan.
        </p>
        <p className="mt-4 inline-block rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          Early development build: accounts work today; the 3D Studio and estimates are being added next.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={session ? '/dashboard' : '/signup'}><Button variant="accent">{session ? 'Open dashboard' : 'Create your account'}</Button></Link>
          {!session && <Link to="/login"><Button variant="outline">Log in</Button></Link>}
        </div>
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        Estimates are for preliminary planning. Verify with a qualified engineer before procurement.
      </footer>
    </div>
  )
}
