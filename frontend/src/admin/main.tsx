import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import '@/index.css'
import { configProblems } from '@/lib/env'
import { ToastProvider } from '@/lib/toast'
import ConfigError from '@/pages/ConfigError'
import AdminApp from './AdminApp'

const problems = configProblems()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {problems.length ? <ConfigError problems={problems} /> : (
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AdminApp />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
)
