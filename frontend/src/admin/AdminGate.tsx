import { ShieldAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Alert, Spinner } from '@/components/ui/feedback'
import { AuthShell } from '@/features/auth/AuthShell'
import { useAuth } from '@/features/auth/useAuth'
import { ApiError } from '@/lib/api'
import { adminApi } from './adminApi'

type Check = 'checking' | 'admin' | 'not-admin' | { error: string }

/** Lets only Admins in. Hiding pages is just convenience: the API and the database refuse non-admins on their own. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth()
  const [check, setCheck] = useState<Check>('checking')

  useEffect(() => {
    if (!session) return
    let live = true
    setCheck('checking')
    adminApi.me()
      .then(() => { if (live) setCheck('admin') })
      .catch((e) => { if (live) setCheck(e instanceof ApiError && e.status === 403 ? 'not-admin' : { error: e instanceof Error ? e.message : 'Could not check your account.' }) })
    return () => { live = false }
  }, [session])

  if (loading) return <Spinner label="Loading…" className="min-h-screen" />
  if (!session) return <Navigate to="/login" replace />
  if (check === 'checking') return <Spinner label="Checking your access…" className="min-h-screen" />
  if (check === 'admin') return <>{children}</>
  return (
    <AuthShell title={check === 'not-admin' ? 'Not allowed' : 'Something went wrong'}>
      <div className="space-y-4">
        {check === 'not-admin' ? (
          <Alert tone="error" title="This account is not an Admin">
            <span className="inline-flex items-center gap-1"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> {session.user.email}</span> cannot open the admin website.
          </Alert>
        ) : <Alert tone="error">{check.error}</Alert>}
        <Button variant="outline" onClick={() => void signOut()}>Log out and use another account</Button>
      </div>
    </AuthShell>
  )
}
