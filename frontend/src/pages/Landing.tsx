import '@fontsource-variable/space-grotesk/wght.css'
import { ArrowRight, BarChart3, Box, Calculator, Check, FileText, Layers, Tag, TrendingDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '@/components/Logo'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'
import duskHouse from '@/assets/home/dusk-house.jpg'
import heroHouse from '@/assets/home/hero-house.jpg'
import houseRender from '@/assets/home/house-render.jpg'

const STEPS = [
  { title: 'Add your rooms', text: 'Create a project and enter each room’s size, doors and windows — or upload a 2D floor plan and let Buildora suggest the rooms.' },
  { title: 'See it in 3D', text: 'Look around the building, switch floors, add stairs, pick colours and finishes, and drag rooms on the 2D plan.' },
  { title: 'Estimate the cost', text: 'Get material quantities and costs from the same model, find ways to cut waste, and download a report.' },
]

const STUDIO_SWITCHES = ['Exterior', 'Top-down plan', '2D plan', 'Labels', 'Roof', 'Walls', 'Doors & windows', 'Furniture', 'Wireframe']
const STUDIO_POINTS = ['Stairs between floors', 'Drag & resize rooms', 'Copy a whole floor', 'Pinch to zoom on phones']

const FEATURES = [
  { icon: Box, title: '3D Building Studio', text: 'See your rooms as a full building, floor by floor.', warm: true },
  { icon: Calculator, title: 'Material Estimation', text: 'Cement, bricks, steel, sand and more — with wastage included.' },
  { icon: Tag, title: 'Materials & Prices', text: 'Keep your own price list and use it in every estimate.', warm: true },
  { icon: BarChart3, title: 'Cost Analysis', text: 'See where the money goes, by category and by room.' },
  { icon: TrendingDown, title: 'Waste Optimization', text: 'Find where material is wasted and how to save it.', warm: true },
  { icon: FileText, title: 'Reports', text: 'Download a clean report to share with your builder.' },
]

const ESTIMATE_BARS = [
  { name: 'Cement', w: 'w-[88%]', c: 'bg-brand-500' },
  { name: 'Bricks', w: 'w-[72%]', c: 'bg-navy-500' },
  { name: 'Steel', w: 'w-[46%]', c: 'bg-navy-300' },
  { name: 'Sand', w: 'w-[60%]', c: 'bg-navy-200' },
]

const btn = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition hover:-translate-y-px focus-visible:outline-2'
const primary = `${btn} bg-brand-500 text-white hover:bg-brand-600`
const ghost = `${btn} border border-white/25 font-medium text-slate-100 hover:bg-white/10`
const eyebrow = 'text-[13px] font-semibold uppercase tracking-[0.14em]'
const h2 = 'font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[44px]'

function Tick({ children }: { children: ReactNode }) {
  return <li className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-brand-500" strokeWidth={2.6} aria-hidden="true" />{children}</li>
}

export default function Landing() {
  const { session } = useAuth()
  const start = session ? { to: '/dashboard', label: 'Open dashboard' } : { to: '/signup', label: 'Create your account' }

  return (
    <div className="min-h-screen overflow-x-hidden bg-navy-950 text-slate-100">
      <header className="relative z-10 border-b border-white/10 bg-navy-950/80">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2.5 text-white" aria-label="Buildora home">
            <LogoMark className="rounded-lg ring-1 ring-white/20" />
            <span className="font-display text-xl font-bold tracking-tight">Buildora</span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <a href="#features" className="hidden px-3 py-2 text-sm text-slate-300 hover:text-white md:inline">Features</a>
            <a href="#how" className="hidden px-3 py-2 text-sm text-slate-300 hover:text-white md:inline">How it works</a>
            {session ? (
              <Link to="/dashboard" className={cn(primary, 'px-4 py-2.5 text-sm')}>Open dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-100 hover:bg-white/10">Log in</Link>
                <Link to="/signup" className={cn(primary, 'px-4 py-2.5 text-sm')}>Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* hero */}
        <section className="relative">
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(95,130,176,0.09)_1px,transparent_1px),linear-gradient(90deg,rgba(95,130,176,0.09)_1px,transparent_1px)] bg-[size:48px_48px]" />
          <div aria-hidden="true" className="absolute -right-32 top-10 h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.2),rgba(249,115,22,0)_65%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <p className={cn(eyebrow, 'self-start rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs text-orange-300')}>Plan smarter. Build better.</p>
              <h1 className="font-display text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-white! sm:text-6xl lg:text-[64px]">
                Plan your building <span className="text-brand-500">in 3D</span>, then estimate what it takes to build it.
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-slate-300">
                Buildora turns your rooms into a 3D model and a material estimate from the same geometry, so every quantity can be traced back to the plan.
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                <Link to={start.to} className={cn(primary, 'px-6 py-3.5 text-base')}>{start.label} <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" /></Link>
                {!session && <Link to="/login" className={cn(ghost, 'px-6 py-3.5 text-base')}>Log in</Link>}
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-slate-400">
                <Tick>Sign in with Google or email</Tick>
                <Tick>Metric or imperial units</Tick>
                <Tick>Downloadable reports</Tick>
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
              <div className="overflow-hidden rounded-[20px] border border-white/20 bg-navy-900 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)]">
                <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-navy-600" /><span className="h-2.5 w-2.5 rounded-full bg-navy-600" /><span className="h-2.5 w-2.5 rounded-full bg-navy-600" />
                  <span className="ml-2 text-xs text-slate-400">From plan to a real home</span>
                </div>
                <img src={heroHouse} alt="Finished modern two-storey house with a pool" width={1400} height={933} fetchPriority="high" className="block h-72 w-full object-cover sm:h-[440px]" />
              </div>
              <div className="motion-safe:animate-float absolute -bottom-6 left-3 w-56 rounded-2xl bg-white/95 p-4 text-navy-900 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] sm:bottom-9 sm:-left-7 sm:w-60">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">Material estimate</span><span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">DEMO</span></div>
                <div className="mt-3 flex flex-col gap-2 text-xs">
                  {ESTIMATE_BARS.map((b) => <div key={b.name} className="grid grid-cols-[56px_1fr] items-center gap-2"><span>{b.name}</span><span className={cn('h-1.5 rounded-full', b.w, b.c)} /></div>)}
                </div>
                <p className="mt-3 text-[11px] text-slate-600">Every quantity traced to the plan</p>
              </div>
              <div className="motion-safe:animate-float-slow absolute -right-2 top-16 hidden items-center gap-2 rounded-xl border border-white/30 bg-navy-900 px-3.5 py-2.5 text-xs text-slate-100 shadow-[0_16px_32px_-10px_rgba(0,0,0,0.5)] sm:flex sm:-right-4">
                <Layers className="h-4 w-4 text-orange-400" aria-hidden="true" />Floor 2 of 2 · stairs aligned
              </div>
            </div>
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="scroll-mt-4 border-y border-white/10 bg-[#0a1a33]">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 sm:py-24">
            <div className="flex max-w-2xl flex-col gap-3">
              <p className={cn(eyebrow, 'text-orange-400')}>How it works</p>
              <h2 className={cn(h2, 'text-white!')}>From rooms to a costed building in three steps.</h2>
            </div>
            <ol className="grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3.5 rounded-[18px] border border-white/15 bg-navy-900 p-7 transition duration-300 hover:-translate-y-1 hover:border-brand-500/60">
                  <span className="font-display text-[44px] font-bold leading-none text-brand-500">0{i + 1}</span>
                  <h3 className="text-xl font-semibold text-white!">{s.title}</h3>
                  <p className="leading-relaxed text-slate-400">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* studio */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2">
          <div className="flex flex-col gap-3.5 rounded-[20px] border border-white/15 bg-navy-900 p-5">
            <img src={houseRender} alt="3D rendering of a modern white house with a lit entrance, palm trees and a garden path" width={1200} height={675} loading="lazy" className="block h-64 w-full rounded-[14px] object-cover sm:h-[360px]" />
            <p className="mt-1 text-[13px] text-slate-400">Switch on or off in the Studio:</p>
            <ul className="flex flex-wrap gap-2">
              {STUDIO_SWITCHES.map((s, i) => <li key={s} className={cn('rounded-full px-3 py-1.5 text-xs', i === 0 ? 'bg-brand-500 font-semibold text-white' : 'border border-white/25 text-slate-300')}>{s}</li>)}
            </ul>
          </div>
          <div className="flex flex-col gap-5">
            <p className={cn(eyebrow, 'text-orange-400')}>3D Building Studio</p>
            <h2 className={cn(h2, 'text-white!')}>Design your dream home, room by room.</h2>
            <p className="text-[17px] leading-relaxed text-slate-300">Turn any part on or off, look from the top or the street, open the doors, and see furniture in each room. Every change can be undone.</p>
            <ul className="grid gap-3 text-[15px] text-slate-100 sm:grid-cols-2">
              {STUDIO_POINTS.map((p) => <Tick key={p}>{p}</Tick>)}
            </ul>
          </div>
        </section>

        {/* features */}
        <section id="features" className="scroll-mt-4 bg-[#f4f6fa] text-navy-900">
          <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:px-6 sm:py-24">
            <div className="flex max-w-2xl flex-col gap-3">
              <p className={cn(eyebrow, 'text-brand-700')}>Everything in one place</p>
              <h2 className={h2}>Plan, price and report — without spreadsheets.</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text, warm }) => (
                <article key={title} className="flex flex-col gap-3 rounded-[18px] border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-500/50 hover:shadow-[0_18px_40px_-18px_rgba(11,31,58,0.3)]">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', warm ? 'bg-orange-50 text-brand-600' : 'bg-navy-50 text-navy-700')}><Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden="true" /></span>
                  <h3 className="text-[19px] font-semibold">{title}</h3>
                  <p className="leading-relaxed text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* call to action */}
        <section className="relative overflow-hidden">
          <img src={duskHouse} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,20,42,0.92),rgba(7,20,42,0.62)_50%,rgba(7,20,42,0.92))]" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-24 text-center sm:py-28">
            <h2 className="font-display text-4xl font-bold leading-tight tracking-tight text-white! sm:text-5xl">Start planning your building today.</h2>
            <p className="text-lg text-slate-300">{session ? 'Pick up where you left off.' : 'Create a free account, then load the demo project to see the whole workflow.'}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Link to={start.to} className={cn(primary, 'px-6 py-3.5 text-base')}>{start.label}</Link>
              {!session && <Link to="/login" className={cn(ghost, 'px-6 py-3.5 text-base')}>Log in</Link>}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-7 text-[13px] text-slate-400 sm:px-6">
          <span className="font-display font-bold text-slate-100">Buildora</span>
          <span>Estimates are for preliminary planning. Verify with a qualified engineer before procurement.</span>
          <span className="w-full text-xs text-slate-400">Photos: Ярослав Алексеенко and Michael Brown on Unsplash. 3D render: Salman Saqib on Unsplash.</span>
        </div>
      </footer>
    </div>
  )
}
