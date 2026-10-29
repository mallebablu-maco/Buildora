import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthContext, type AuthContextValue } from './auth-context'

export function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    session: null,
    user: null,
    loading: false,
    recovery: false,
    signIn: vi.fn().mockResolvedValue(undefined),
    signUp: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    sendLoginCode: vi.fn().mockResolvedValue(undefined),
    verifyLoginCode: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

export function renderWithAuth(ui: ReactNode, value: AuthContextValue, route = '/') {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

/** Just enough of a Supabase session for the UI. */
export const fakeSession = { access_token: 't', user: { id: 'u1', email: 'asha@example.com', user_metadata: { full_name: 'Asha Rao' } } } as unknown as NonNullable<AuthContextValue['session']>
