import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/feedback'
import { useToast } from '@/lib/toast'
import { AuthShell, SigningIn, useAuthRedirect } from './AuthShell'
import { ChoosePasswordForm } from './ChoosePasswordForm'
import { useAuth } from './useAuth'

/** Where the "Confirm your email" button lands: the email is now proven and the person is signed in; they choose their password. */
export default function SetPasswordPage() {
  const { session, loading } = useAuth()
  const redirect = useAuthRedirect(!!session)
  const navigate = useNavigate()
  const toast = useToast()

  if (loading || redirect.waiting) return <SigningIn />

  if (!session) {
    return (
      <AuthShell title="This link has expired">
        <div className="space-y-4">
          <Alert tone="warning">{redirect.error ?? 'The confirmation link is invalid, has expired, or was already used.'}</Alert>
          <p className="text-sm text-slate-600">Sign up again with the same email to get a new link, or log in if you already chose a password.</p>
          <div className="flex gap-4 text-sm">
            <Link to="/signup" className="font-medium text-navy-700 underline underline-offset-2">Send a new link</Link>
            <Link to="/login" className="font-medium text-navy-700 underline underline-offset-2">Log in</Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose your password" subtitle={`Your email ${session.user.email ?? ''} is confirmed. Choose a password to finish creating your account.`}>
      <ChoosePasswordForm submitLabel="Save password and continue" onSaved={() => { toast.success('Password saved. Welcome to Buildora!'); navigate('/dashboard', { replace: true }) }} />
    </AuthShell>
  )
}
