import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '@/features/auth/auth-context'
import { authValue, fakeSession } from '@/features/auth/test-utils'
import { ToastProvider } from '@/lib/toast'

/** Render a screen the way the app does: router, data cache (no retries), toasts and a signed-in user. */
export function renderApp(ui: ReactNode, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const value = authValue({ session: fakeSession, user: fakeSession.user })
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={value}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}
