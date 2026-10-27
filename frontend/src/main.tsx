import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import './index.css'
import { ApiError } from './lib/api'
import { configProblems } from './lib/env'
import { ToastProvider } from './lib/toast'
import { UnitsProvider } from './lib/units'
import ConfigError from './pages/ConfigError'

const problems = configProblems()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Do not retry answers that will not change (401/403/404/422); retry network blips and server errors twice.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {problems.length ? (
      <ConfigError problems={problems} />
    ) : (
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <UnitsProvider>
                <App />
              </UnitsProvider>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
)
