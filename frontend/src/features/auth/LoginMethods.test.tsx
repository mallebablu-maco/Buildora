import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import SignupPage from './SignupPage'
import { authValue, renderWithAuth } from './test-utils'

const routes = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/dashboard" element={<p>dashboard</p>} />
  </Routes>
)

describe('Continue with Google', () => {
  it.each(['/login', '/signup'])('is offered on %s and starts the Google sign-in', async (route) => {
    const user = userEvent.setup()
    const value = authValue()
    renderWithAuth(routes, value, route)
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(value.signInWithGoogle).toHaveBeenCalledTimes(1)
  })
  it('explains in plain words when Google is not switched on in Supabase', async () => {
    const user = userEvent.setup()
    renderWithAuth(routes, authValue({ signInWithGoogle: vi.fn().mockRejectedValue(new Error('Unsupported provider: provider is not enabled')) }), '/login')
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText(/Google sign-in is not switched on yet/)).toBeInTheDocument()
  })
})

describe('No email-link login', () => {
  it.each([['/login', 'Password'], ['/signup', 'Full name']])('%s offers only Google and the normal form', (route, field) => {
    renderWithAuth(routes, authValue(), route)
    expect(screen.queryByText(/email link|sign-in link/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(field)).toBeInTheDocument()
  })
})

describe('coming back from Google or an email link', () => {
  const at = (url: string) => window.history.replaceState(null, '', url)
  it('shows "Signing you in…" instead of flashing the form while the login finishes', () => {
    at('/login#access_token=abc&refresh_token=def&type=magiclink')
    renderWithAuth(routes, authValue(), '/login')
    expect(screen.getByText('Signing you in…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    at('/')
  })
  it('shows "Signing you in…" while the saved session is still being read', () => {
    renderWithAuth(routes, authValue({ loading: true }), '/login')
    expect(screen.getByText('Signing you in…')).toBeInTheDocument()
  })
  it('explains an expired or already-used email link, and shows the form again', () => {
    at('/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    renderWithAuth(routes, authValue(), '/login')
    expect(screen.getByText(/sign-in link has expired or was already used/)).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(window.location.hash).toBe('')  // the error is removed from the address bar
  })
})
