import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase, setKeepSignedIn } from '@/lib/supabase'
import { AuthContext, type AuthContextValue } from './auth-context'

/** Supabase Auth session for the whole app. Passwords and tokens are handled by supabase-js; nothing is stored by us. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setLoading(false)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password, keep) => {
    setKeepSignedIn(keep) // before signing in, so the session is written to the right storage
    const { error } = await getSupabase().auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async ({ fullName, email, password, persona }) => {
    setKeepSignedIn(true)
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: {
        // user_metadata is editable by the user: it is for display and the profile only, never for access decisions.
        data: { full_name: fullName, persona, disclaimer_accepted_at: new Date().toISOString() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw error
    return { needsEmailConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw error
  }, [])

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) throw error
    setRecovery(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading, recovery, signIn, signUp, signOut, requestPasswordReset, updatePassword }),
    [session, loading, recovery, signIn, signUp, signOut, requestPasswordReset, updatePassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
