import { screen, waitFor } from '@testing-library/react'
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
  await user.type(screen.getByLabelText('Password'), 'longenough')
  await user.click(screen.getByText('Engineer'))
  if (disclaimer) await user.click(screen.getByLabelText(/I understand estimates/))
}

describe('SignupPage', () => {
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

  it('submits the chosen details and asks the user to confirm their email', async () => {
    const value = authValue()
    const user = userEvent.setup()
    renderWithAuth(page, value, '/signup')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(value.signUp).toHaveBeenCalledWith({ fullName: 'Asha Rao', email: 'asha@example.com', password: 'longenough', persona: 'engineer' }))
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText('asha@example.com')).toBeInTheDocument()
  })

  it('shows a friendly message when Supabase rejects the sign-up', async () => {
    const value = authValue({ signUp: vi.fn().mockRejectedValue(new Error('User already registered')) })
    const user = userEvent.setup()
    renderWithAuth(page, value, '/signup')
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('An account with this email already exists. Try logging in.')).toBeInTheDocument()
  })

  it('goes straight to the dashboard when a session exists', () => {
    renderWithAuth(page, authValue({ session: fakeSession, user: fakeSession.user }), '/signup')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
  })
})
