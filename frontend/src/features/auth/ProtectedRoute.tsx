import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/feedback'
import { useAuth } from './useAuth'

/** Everything inside requires a signed-in user. Visitors are sent to the login page and brought back afterwards. */
export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner label="Checking your session…" className="min-h-screen" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
