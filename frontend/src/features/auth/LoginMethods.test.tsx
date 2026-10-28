import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LoginCodePage from './LoginCodePage'
import LoginPage from './LoginPage'
import SignupPage from './SignupPage'
import { authValue, fakeSession, renderWithAuth } from './test-utils'

const routes = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/login/code" element={<LoginCodePage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/dashboard" element={<p>dashboard</p>} />
  </Routes>
)

describe('Continue with Google', () => {
  it.each(['/login', '/signup', '/login/code'])('is offered on %s and starts the Google sign-in', async (route) => {
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

describe('Log in with an email code', () => {
  it('the password page links to it, and the password login still exists', () => {
    renderWithAuth(routes, authValue(), '/login')
    expect(screen.getByRole('link', { name: 'Email me a login code' })).toHaveAttribute('href', '/login/code')
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })
  it('sends a code, then logs in with the typed code', async () => {
    const user = userEvent.setup()
    const value = authValue()
    renderWithAuth(routes, value, '/login/code')
    await user.type(screen.getByLabelText('Email'), 'asha@example.com')
    await user.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(value.sendLoginCode).toHaveBeenCalledWith('asha@example.com')
    expect(await screen.findByText('asha@example.com')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Code from the email'), '12ab3456')  // letters are dropped as you type
    expect(screen.getByLabelText('Code from the email')).toHaveValue('123456')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(value.verifyLoginCode).toHaveBeenCalledWith('asha@example.com', '123456')
  })
  it('shows a wrong or expired code clearly and waits before re-sending', async () => {
    const user = userEvent.setup()
    renderWithAuth(routes, authValue({ verifyLoginCode: vi.fn().mockRejectedValue(new Error('Token has expired or is invalid')) }), '/login/code')
    await user.type(screen.getByLabelText('Email'), 'asha@example.com')
    await user.click(screen.getByRole('button', { name: 'Email me a code' }))
    expect(await screen.findByRole('button', { name: /Send again in \d+s/ })).toBeDisabled()
    await user.type(screen.getByLabelText('Code from the email'), '000000')
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText(/code is wrong or has expired/)).toBeInTheDocument()
  })
  it('refuses an invalid email under the box', async () => {
    const user = userEvent.setup()
    renderWithAuth(routes, authValue(), '/login/code')
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Email me a code' })).toBeDisabled()
  })
  it('goes to the dashboard once signed in', async () => {
    renderWithAuth(routes, authValue({ session: fakeSession }), '/login/code')
    await waitFor(() => expect(screen.getByText('dashboard')).toBeInTheDocument())
  })
})
