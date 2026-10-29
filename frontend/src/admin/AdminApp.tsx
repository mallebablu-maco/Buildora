import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import NotFound from '@/pages/NotFound'
import { AdminGate } from './AdminGate'
import { AdminLayout } from './AdminLayout'
import AdminLogin from './AdminLogin'

const Overview = lazy(() => import('./pages/Overview'))
const UsersPage = lazy(() => import('./pages/Users'))
const MaterialsPage = lazy(() => import('./pages/Materials'))

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLogin />} />
      <Route element={<AdminGate><AdminLayout /></AdminGate>}>
        <Route path="/" element={<Overview />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/materials" element={<MaterialsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
