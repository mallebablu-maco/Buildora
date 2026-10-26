/** Turn Supabase Auth error messages into plain language. Unknown messages are passed through unchanged. */
export function authMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const m = raw.toLowerCase()
  if (!raw) return 'Something went wrong. Please try again.'
  if (m.includes('invalid login credentials')) return 'The email or password is incorrect.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first: open the link we sent you, then log in.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try logging in.'
  if (m.includes('password should be at least') || m.includes('weak password')) return 'That password is too weak. Use a longer one with a mix of characters.'
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) return 'Cannot reach the sign-in service. Check your connection and try again.'
  if (m.includes('same password')) return 'Choose a password different from your current one.'
  if (m.includes('signups not allowed')) return 'Sign-ups are currently disabled.'
  return raw
}
