import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import './index.css'
import { configProblems } from './lib/env'
import ConfigError from './pages/ConfigError'

const problems = configProblems()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {problems.length ? (
      <ConfigError problems={problems} />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
)
