import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import ForgotPasswordPage from '@/features/auth/ForgotPasswordPage'
import LoginCodePage from '@/features/auth/LoginCodePage'
import LoginPage from '@/features/auth/LoginPage'
import SetPasswordPage from '@/features/auth/SetPasswordPage'
import ResetPasswordPage from '@/features/auth/ResetPasswordPage'
import SignupPage from '@/features/auth/SignupPage'
import MyProjectsPage from '@/features/projects/MyProjectsPage'
import NewProjectPage from '@/features/projects/NewProjectPage'
import ProjectPage from '@/features/projects/ProjectPage'
import { AppLayout } from '@/layouts/AppLayout'
import Landing from '@/pages/Landing'
import NotFound from '@/pages/NotFound'
import SettingsPage from '@/pages/Settings'

// the 3D scene and the charts are large: they are downloaded only when their page is opened
const Catalogue = lazy(() => import('@/pages/Catalogue'))
const CostAnalysis = lazy(() => import('@/pages/CostAnalysis'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Estimation = lazy(() => import('@/pages/Estimation'))
const Optimization = lazy(() => import('@/pages/Optimization'))
const Prices = lazy(() => import('@/pages/Prices'))
const Reports = lazy(() => import('@/pages/Reports'))
const Studio = lazy(() => import('@/pages/Studio'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/code" element={<LoginCodePage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<MyProjectsPage />} />
          <Route path="/projects/new" element={<NewProjectPage />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/studio/:projectId?" element={<Studio />} />
          <Route path="/estimation/:projectId?" element={<Estimation />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/prices" element={<Prices />} />
          <Route path="/cost-analysis/:projectId?" element={<CostAnalysis />} />
          <Route path="/optimization/:projectId?" element={<Optimization />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
