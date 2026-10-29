import { LayoutDashboard, LogOut, Menu, Package, Users, X } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Spinner } from '@/components/ui/feedback'
import { LogoutConfirm } from '@/features/auth/LogoutConfirm'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/materials', label: 'Materials & Prices', icon: Package },
]

export function AdminLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const sidebar = (onClose?: () => void) => (
    <div className="flex h-full flex-col bg-navy-950 text-slate-300">
      <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-4">
        <span className="flex items-center gap-2"><Logo dark /><span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Admin</span></span>
        {onClose && <button type="button" aria-label="Close menu" onClick={onClose} className="cursor-pointer rounded p-1 hover:bg-white/10"><X className="h-5 w-5" /></button>}
      </div>
      <nav aria-label="Admin" className="flex-1 space-y-1 p-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10 hover:text-white', isActive && 'bg-orange-500 text-white hover:bg-orange-500')}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <p className="truncate px-3 pb-2 text-xs text-slate-400" title={user?.email ?? ''}>{user?.email}</p>
        <button type="button" onClick={() => setConfirmLogout(true)} className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-white/10 hover:text-white">
          <LogOut className="h-[18px] w-[18px]" aria-hidden="true" /> Log out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">{sidebar()}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar(() => setMenuOpen(false))}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="cursor-pointer rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"><Menu className="h-5 w-5" /></button>
          <span className="text-sm font-medium text-slate-600">Buildora · Admin website</span>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6"><Suspense fallback={<Spinner />}><Outlet /></Suspense></main>
      </div>
      <LogoutConfirm open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </div>
  )
}
