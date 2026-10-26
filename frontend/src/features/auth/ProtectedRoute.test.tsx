import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'
import { authValue, fakeSession, renderWithAuth } from './test-utils'

const tree = (
  <Routes>
    <Route path="/login" element={<p>login page</p>} />
    <Route element={<ProtectedRoute />}>
      <Route path="/dashboard" element={<p>secret dashboard</p>} />
    </Route>
  </Routes>
)

describe('ProtectedRoute', () => {
  it('sends visitors without a session to the login page', () => {
    renderWithAuth(tree, authValue({ session: null }), '/dashboard')
    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument()
  })
  it('shows a loading state, not the page, while the session is being read', () => {
    renderWithAuth(tree, authValue({ loading: true }), '/dashboard')
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })
  it('renders the page for a signed-in user', () => {
    renderWithAuth(tree, authValue({ session: fakeSession, user: fakeSession.user }), '/dashboard')
    expect(screen.getByText('secret dashboard')).toBeInTheDocument()
  })
})
