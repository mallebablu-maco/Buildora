import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/lib/toast'
import { AuthContext } from './auth-context'
import LoginPage from './LoginPage'
import ResetPasswordPage from './ResetPasswordPage'
import SetPasswordPage from './SetPasswordPage'
import { authValue, fakeSession } from './test-utils'

function show(route: string, value = authValue({ session: fakeSession, user: fakeSession.user })) {
  render(
    <AuthContext.Provider value={value}><ToastProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider></AuthContext.Provider>,
  )
  return { user: userEvent.setup(), value }
}

describe('Choose your password (after clicking "Confirm your email")', () => {
  it('has Password and Confirm password, each with a show/hide eye', async () => {
    const { user } = show('/set-password')
    expect(screen.getByRole('heading', { name: 'Choose your password' })).toBeInTheDocument()
    const pw = screen.getByLabelText('Password')
    expect(pw).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'password')
    const eyes = screen.getAllByRole('button', { name: 'Show password' })
    expect(eyes).toHaveLength(2)
    await user.click(eyes[0])
    expect(pw).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })
  it('says straight away when the two passwords differ or the password is too short, and saves nothing', async () => {
    const { user, value } = show('/set-password')
    await user.type(screen.getByLabelText('Password'), 'short')
    expect(await screen.findByText('Use 8 or more characters.', { selector: '[role="alert"]' })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    await user.type(screen.getByLabelText('Confirm password'), 'longenough2')
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save password and continue' }))
    expect(value.updatePassword).not.toHaveBeenCalled()
  })
  it('saves the password and opens the dashboard', async () => {
    const { user, value } = show('/set-password')
    await user.type(screen.getByLabelText('Password'), 'longenough1')
    await user.type(screen.getByLabelText('Confirm password'), 'longenough1')
    await user.click(screen.getByRole('button', { name: 'Save password and continue' }))
    await waitFor(() => expect(value.updatePassword).toHaveBeenCalledWith('longenough1'))
    expect(await screen.findByText('dashboard')).toBeInTheDocument()
  })
  it('explains an expired link instead of showing the form', () => {
    show('/set-password', authValue())
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Send a new link' })).toHaveAttribute('href', '/signup')
  })
  it('the reset-password page uses the same two boxes with eyes', () => {
    show('/reset-password', authValue({ session: fakeSession, user: fakeSession.user, recovery: true }))
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(2)
  })
  it('the log-in password box has an eye too', () => {
    show('/login', authValue({ signIn: vi.fn() }))
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })
})
