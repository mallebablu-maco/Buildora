import { useEffect, useState } from 'react'
import { Alert, Spinner } from '@/components/ui/feedback'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { apiFetch } from '@/lib/api'

interface Me { id: string; email: string; full_name: string; persona: string }
type Check = { state: 'loading' } | { state: 'ok'; me: Me } | { state: 'error'; message: string }

/** Placeholder dashboard. The connection check proves the chain browser -> Supabase sign-in -> API token verification. */
export default function Dashboard() {
  const { user } = useAuth()
  const [check, setCheck] = useState<Check>({ state: 'loading' })

  useEffect(() => {
    let active = true
    apiFetch<Me>('/me')
      .then((me) => active && setCheck({ state: 'ok', me }))
      .catch((e: unknown) => active && setCheck({ state: 'error', message: e instanceof Error ? e.message : 'The API check failed.' }))
    return () => { active = false }
  }, [])

  const first = ((user?.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">{first ? `Welcome, ${first}` : 'Welcome'}</h1>
        <p className="mt-1 text-sm text-slate-600">Your projects and estimates will appear here. The Studio, projects and estimates are being built in phases.</p>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-navy-900">Connection check</h2>
        <div className="mt-3">
          {check.state === 'loading' && <Spinner label="Asking the API who you are…" className="justify-start py-2" />}
          {check.state === 'error' && <Alert tone="error" title="The API did not accept your session">{check.message}</Alert>}
          {check.state === 'ok' && (
            <div className="space-y-3">
              <Alert tone="success">Signed in with Supabase Auth, and the API verified your token.</Alert>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                <dt className="text-slate-500">Name</dt><dd>{check.me.full_name || '—'}</dd>
                <dt className="text-slate-500">Email</dt><dd>{check.me.email}</dd>
                <dt className="text-slate-500">I am a</dt><dd className="capitalize">{check.me.persona || '—'}</dd>
                <dt className="text-slate-500">User id</dt><dd className="break-all font-mono text-xs">{check.me.id}</dd>
              </dl>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
