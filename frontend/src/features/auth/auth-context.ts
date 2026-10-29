import type { Session, User } from '@supabase/supabase-js'
import { createContext } from 'react'
import type { Persona } from './schemas'

export interface SignUpInput {
  fullName: string
  email: string
  persona: Persona
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  /** true until the stored session (if any) has been read */
  loading: boolean
  /** true when the user arrived through a password-reset link */
  recovery: boolean
  signIn: (email: string, password: string, keep: boolean) => Promise<void>
  /** Emails a "Confirm your email" button. It signs the person in and opens /set-password, where they choose their password.
   *  Calling it again re-sends the email. */
  signUp: (input: SignUpInput) => Promise<void>
  signOut: () => Promise<void>
  /** Leaves the page for Google's sign-in and comes back to /login, where the new session redirects into the app. */
  signInWithGoogle: () => Promise<void>
  /** Emails a one-time login code (and link). Creates the account on first use, so it also works as sign-up. */
  sendLoginCode: (email: string) => Promise<void>
  verifyLoginCode: (email: string, code: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
