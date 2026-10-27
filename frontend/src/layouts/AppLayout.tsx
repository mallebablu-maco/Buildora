import { BarChart3, BookOpen, Box, Calculator, FileText, FolderOpen, LayoutDashboard, LogOut, Menu, PlusSquare, Settings, Tag, TrendingDown, X } from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/feedback'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

/** Navigation as designed. Entries without `to` are planned pages that are built in later phases. */
const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'My Projects', icon: FolderOpen, to: '/projects', end: true },
  { label: 'New Project', icon: PlusSquare, to: '/projects/new' },
  { label: '3D Building Studio', to: '/studio', icon: Box },
  { label: 'Material Estimation', to: '/estimation', icon: Calculator },
  { label: 'Material Catalogue', to: '/catalogue', icon: BookOpen },
  { label: 'Material Prices', to: '/prices', icon: Tag },
  { label: 'Cost Analysis', to: '/cost-analysis', icon: BarChart3 },
  { label: 'Waste Optimization', to: '/optimization', icon: TrendingDown },
  { label: 'Reports', to: '/reports', icon: FileText },
  { label: 'Settings', to: '/settings', icon: Settings },
] as { label: string; icon: typeof Box; to?: string; end?: boolean }[]

export function AppLayout() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const name = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Account'

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <aside className={cn('fixed inset-y-0 left-0 z-30 w-64 transform bg-navy-900 text-slate-200 transition-transform md:static md:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center justify-between px-5">
          <Logo dark />
          <button className="md:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </div>
        <nav aria-label="Main" className="space-y-0.5 px-3 py-2">
          {NAV.map(({ label, icon: Icon, to, end }) =>
            to ? (
              <NavLink key={label} to={to} end={end} onClick={() => setOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-navy-700 text-white' : 'hover:bg-navy-800')}>
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </NavLink>
            ) : (
              <span key={label} aria-disabled="true" className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400">
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                <span className="ml-auto rounded bg-navy-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">soon</span>
              </span>
            ),
          )}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="rounded-lg p-2 hover:bg-slate-100 md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <span className="hidden text-sm italic text-slate-500 md:block">Plan Smarter. Build Better.</span>
          <div className="flex items-center gap-3">
            <span className="max-w-[12rem] truncate text-sm font-medium text-navy-900">{name}</span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Log out</Button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6"><Suspense fallback={<Spinner />}><Outlet /></Suspense></main>
      </div>
    </div>
  )
}
