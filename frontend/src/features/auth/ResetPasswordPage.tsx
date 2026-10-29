import { Link, useNavigate } from 'react-router-dom'
import { Alert, Spinner } from '@/components/ui/feedback'
import { AuthShell } from './AuthShell'
import { ChoosePasswordForm } from './ChoosePasswordForm'
import { useAuth } from './useAuth'

/** Landing page of the emailed reset link. supabase-js turns the link into a (recovery) session before this renders the form. */
export default function ResetPasswordPage() {
  const { session, loading, recovery } = useAuth()
  const navigate = useNavigate()

  if (loading) return <Spinner label="Checking your link…" className="min-h-screen" />

  if (!session && !recovery) {
    return (
      <AuthShell title="This link is not valid">
        <div className="space-y-4">
          <Alert tone="warning">The reset link is invalid or has expired. Links can only be used once.</Alert>
          <Link to="/forgot-password" className="inline-block text-sm font-medium text-navy-700 underline underline-offset-2">Request a new link</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password">
      <ChoosePasswordForm submitLabel="Save new password" onSaved={() => navigate('/dashboard', { replace: true })} />
    </AuthShell>
  )
}
