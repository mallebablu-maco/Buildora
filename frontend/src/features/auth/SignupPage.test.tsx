import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import SignupPage from './SignupPage'
import { authValue, fakeSession, renderWithAuth } from './test-utils'

const page = (
  <Routes>
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/dashboard" element={<p>dashboard</p>} />
  </Routes>
)

async function fill(user: ReturnType<typeof userEvent.setup>, { disclaimer = true } = {}) {
  await user.type(screen.getByLabelText('Full name'), 'Asha Rao')
  await user.type(screen.getByLabelText('Email'), 'asha@example.com')
  await user.click(screen.getByText('Engineer'))
  if (disclaimer) await user.click(screen.getByLabelText(/I understand estimates/))
}

describe('SignupPage', () => {
  it('asks for name, email, role and the disclaimer, but no password', () => {
    renderWithAuth(page, authValue(), '/signup')
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('shows validation errors and does not call Supabase when the form is empty', async () => {
    const value = authValue()
    const user = userEvent.setup()
    renderWithAuth(page, value, '/signup')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your email.')).toBeInTheDocument()
    expect(screen.getByText('Please confirm that you understand this.')).toBeInTheDocument()
    expect(value.signUp).not.toHaveBeenCalled()
  })

  it('requires the disclaimer', async () => {
    const value = authValue()
    const user = userEvent.setup()
    renderWithAuth(page, value, '/signup')
    await fill(user, { disclaimer: false })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Please confirm that you understand this.')).toBeInTheDocument()
    expect(value.signUp).not.toHaveBeenCalled()
  })

  it('sends the confirmation email and says what to do next', async () => {
    const value = authValue()
    const user = userEvent.setup()
    renderWithAuth(page, value, '/signup')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(value.signUp).toHaveBeenCalledWith({ fullName: 'Asha Rao', email: 'asha@example.com', persona: 'engineer' }))
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText('asha@example.com')).toBeInTheDocument()
    expect(screen.getByText(/then choose your password/)).toBeInTheDocument()
  })

  it('"Send the email again" waits a minute, then re-sends to the same address', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const value = authValue()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithAuth(page, value, '/signup')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('button', { name: /Send again in \d+s/ })).toBeDisabled()
    for (let i = 0; i < 61; i++) await act(() => vi.advanceTimersByTimeAsync(1000))  // the countdown ticks once a second
    await user.click(await screen.findByRole('button', { name: 'Send the email again' }))
    await waitFor(() => expect(value.signUp).toHaveBeenCalledTimes(2))
    expect(vi.mocked(value.signUp).mock.calls[1][0]).toMatchObject({ email: 'asha@example.com' })
    vi.useRealTimers()
  })

  it('shows a friendly message when Supabase refuses', async () => {
    const value = authValue({ signUp: vi.fn().mockRejectedValue(new Error('Email rate limit exceeded')) })
    const user = userEvent.setup()
    renderWithAuth(page, value, '/signup')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Too many attempts. Please wait a few minutes and try again.')).toBeInTheDocument()
  })

  it('goes straight to the dashboard when a session exists', () => {
    renderWithAuth(page, authValue({ session: fakeSession, user: fakeSession.user }), '/signup')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })
})
