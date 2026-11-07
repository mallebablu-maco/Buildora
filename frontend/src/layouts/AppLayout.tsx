import '@fontsource-variable/space-grotesk/wght.css'
import {
  BarChart3, Box, Calculator, ChevronsLeft, ChevronsRight, FileText, FolderOpen, LayoutDashboard, LogOut, Menu, PlusSquare, Settings, Tag, TrendingDown,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/feedback'
import { LogoutConfirm } from '@/features/auth/LogoutConfirm'
import { useAuth } from '@/features/auth/useAuth'
import { prefetchStudio3D } from '@/features/studio/prefetch'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'My Projects', icon: FolderOpen, to: '/projects', end: true },
  { label: 'New Project', icon: PlusSquare, to: '/projects/new' },
  { label: '3D Building Studio', icon: Box, to: '/studio' },
  { label: 'Material Estimation', icon: Calculator, to: '/estimation' },
  { label: 'Materials & Prices', icon: Tag, to: '/materials' },
  { label: 'Cost Analysis', icon: BarChart3, to: '/cost-analysis' },
  { label: 'Waste Optimization', icon: TrendingDown, to: '/optimization' },
  { label: 'Reports', icon: FileText, to: '/reports' },
  { label: 'Settings', icon: Settings, to: '/settings' },
] as { label: string; icon: typeof Box; to: string; end?: boolean }[]

const COLLAPSE_KEY = 'buildora_sidebar_collapsed'

export function AppLayout() {
  const { user } = useAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false } })
  const [mobileOpen, setMobileOpen] = useState(false)
  const name = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Account'

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  // fetch the 3D Studio's engine quietly once the app is idle, so opening the Studio is fast
  useEffect(() => { prefetchStudio3D() }, [])
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* private window: just don't remember it */ } return !c })

  const sidebar = (compact: boolean) => (
    <nav aria-label="Main" className="flex h-full flex-col bg-navy-950 bg-[radial-gradient(circle_at_0%_0%,rgba(249,115,22,0.12),rgba(249,115,22,0)_45%)] text-slate-300">
      <div className={cn('flex h-16 shrink-0 items-center border-b border-white/10 px-4', compact && 'justify-center px-0')}>
        <Link to="/dashboard" aria-label="Buildora home"><Logo dark compact={compact} /></Link>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map(({ label, icon: Icon, to, end }) => (
          <li key={to}>
            <NavLink to={to} end={end} title={compact ? label : undefined}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.07] hover:text-white',
                isActive && 'bg-[linear-gradient(90deg,rgba(249,115,22,0.24),rgba(249,115,22,0.07))] font-semibold text-white ring-1 ring-inset ring-orange-500/40 hover:bg-[linear-gradient(90deg,rgba(249,115,22,0.24),rgba(249,115,22,0.07))] [&>svg]:text-orange-400', compact && 'justify-center px-0')}>
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {!compact && <span className="truncate">{label}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 p-3">
        <button type="button" title={compact ? 'Log out' : undefined} onClick={() => setConfirmLogout(true)}
          className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-white/[0.07] hover:text-white', compact && 'justify-center px-0')}>
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />{compact ? <span className="sr-only">Log out</span> : 'Log out'}
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex min-h-screen">
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-64')}>{sidebar(collapsed)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar(false)}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggle}>
              {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
            </Button>
            <span className="hidden text-sm italic text-slate-500 sm:inline">Plan Smarter. Build Better.</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/projects/new"><Button variant="accent" size="sm"><PlusSquare className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">New Project</span></Button></Link>
            <Link to="/settings" className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100" title="Account settings">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-navy-900 to-navy-600 text-sm font-semibold text-white" aria-hidden="true">{name[0]?.toUpperCase() ?? '?'}</span>
              <span className="hidden max-w-32 truncate text-sm font-medium text-slate-700 md:inline">{name}</span>
            </Link>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6"><Suspense fallback={<Spinner />}><Outlet /></Suspense></div>
        </main>
      </div>
      <LogoutConfirm open={confirmLogout} onClose={() => setConfirmLogout(false)} />
    </div>
  )
}
