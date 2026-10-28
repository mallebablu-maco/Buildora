import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '@/features/auth/auth-context'
import { authValue, fakeSession } from '@/features/auth/test-utils'
import { ToastProvider } from '@/lib/toast'
import SettingsPage from '@/pages/Settings'
import { AppLayout } from './AppLayout'

function setup() {
  const value = authValue({ session: fakeSession, user: fakeSession.user })
  render(
    <AuthContext.Provider value={value}><ToastProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes><Route element={<AppLayout />}><Route path="/dashboard" element={<p>dashboard</p>} /><Route path="/settings" element={<SettingsPage />} /></Route></Routes>
      </MemoryRouter>
    </ToastProvider></AuthContext.Provider>,
  )
  return { user: userEvent.setup(), value }
}

describe('Log out asks first', () => {
  it('Cancel keeps you logged in', async () => {
    const { user, value } = setup()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Log out?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(value.signOut).not.toHaveBeenCalled()
  })
  it('confirming logs out', async () => {
    const { user, value } = setup()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(value.signOut).toHaveBeenCalledTimes(1))
  })
  it('Escape closes the question without logging out', async () => {
    const { user, value } = setup()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(value.signOut).not.toHaveBeenCalled()
  })
})
