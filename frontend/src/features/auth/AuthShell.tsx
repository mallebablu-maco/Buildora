import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Card } from '@/components/ui/card'

/** Centered card on the engineering-paper grid, shared by every sign-in screen. */
export function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="bg-grid flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" aria-label="Buildora home" className="mb-6"><Logo /></Link>
      <Card className={wide ? 'w-full max-w-lg p-6 sm:p-8' : 'w-full max-w-md p-6 sm:p-8'}>
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
      <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-slate-600 underline underline-offset-2 hover:text-navy-900">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to home
      </Link>
    </main>
  )
}
