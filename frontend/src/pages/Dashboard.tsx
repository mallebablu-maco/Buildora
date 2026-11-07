import { BarChart3, Box, Calculator, FileDown, FolderKanban, Plus, Tags, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/card'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/feedback'
import { CostPie, QuantityBars } from '@/features/pricing/charts'
import { useAsync } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { useAuth } from '@/features/auth/useAuth'
import { useToast } from '@/lib/toast'
import { useUnits } from '@/lib/units'
import { formatDate, formatMoney } from '@/lib/utils'

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const units = useUnits()
  const { data, loading, error, reload } = useAsync(() => api.dashboard(), [])
  const active = (() => { try { return localStorage.getItem('bw_active_project') } catch { return null } })()
  const withProject = (base: string) => (active ? `${base}/${active}` : base)

  if (loading) return <Spinner />
  if (error || !data) return <ErrorState message={error ?? 'Could not load the dashboard.'} onRetry={reload} />
  const cur = data.recent_projects[0]?.currency ?? 'INR'
  const sqftCost = data.avg_cost_per_sqft

  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-navy-900 px-6 py-7 sm:px-8 sm:py-8">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(95,130,176,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(95,130,176,0.12)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div aria-hidden="true" className="absolute -right-20 -top-28 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.35),rgba(249,115,22,0)_65%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white!">{`Welcome, ${((user?.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0]}`}</h1>
            <p className="mt-1.5 text-slate-300">Your projects, estimates and reports at a glance.</p>
          </div>
          <Link to="/projects/new"><Button variant="accent" className="h-11 rounded-xl px-5"><Plus className="h-4 w-4" /> Create project</Button></Link>
        </div>
      </section>
      {data.has_demo_data && <div className="mb-4"><Alert tone="warning" title="Demo data present">Some figures include a project labelled DEMO with illustrative dimensions and sample prices.</Alert></div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total projects" value={data.total_projects} icon={<FolderKanban className="h-4 w-4" />} />
        <Stat label="Total estimated material cost" value={formatMoney(data.total_estimated_cost, cur)} icon={<Wallet className="h-4 w-4" />} hint="Sum of latest saved estimates" />
        <Stat label="Saved estimates" value={data.saved_estimates} icon={<Calculator className="h-4 w-4" />} />
        <Stat label="Avg. material cost / sq ft" value={sqftCost != null ? formatMoney(sqftCost, cur) : '—'} icon={<BarChart3 className="h-4 w-4" />} hint={units.system === 'imperial' ? undefined : 'Averaged over estimated projects'} />
      </div>

      <nav aria-label="Quick actions" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { to: '/projects/new', icon: Plus, label: 'Create project' },
          { to: withProject('/estimation'), icon: Calculator, label: 'Continue estimation' },
          { to: withProject('/studio'), icon: Box, label: 'Open 3D Studio' },
          { to: '/materials', icon: Tags, label: 'Materials & prices' },
          { to: '/reports', icon: FileDown, label: 'Download report' },
        ].map(({ to, icon: Icon, label }) => (
          <Link key={label} to={to} className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 text-sm font-medium text-navy-900 transition-colors hover:border-brand-500 hover:bg-brand-50">
            <Icon className="h-[18px] w-[18px] shrink-0 text-brand-600" aria-hidden="true" />{label}
          </Link>
        ))}
      </nav>

      {data.total_projects === 0 ? (
        <div className="mt-6"><EmptyState title="Start your first project" description="Create a project, or load a labelled demo project to see the full workflow."
          action={<Button variant="outline" onClick={async () => { try { await api.seedDemo(); toast.success('Demo project created.'); await reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') } }}>Load demo project</Button>} /></div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title="Cost distribution by category" /><CardBody><CostPie data={data.cost_distribution} currency={cur} /></CardBody></Card>
            <Card><CardHeader title="Material quantities (all estimates)" description="Quantities include wastage; units differ by material." /><CardBody><QuantityBars data={data.material_quantities} /></CardBody></Card>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader title="Recently updated projects" action={<Link className="text-sm text-orange-600 hover:underline" to="/projects">View all</Link>} />
              <ul className="divide-y divide-slate-100">
                {data.recent_projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0"><Link to={`/projects/${p.id}`} className="font-medium text-navy-900 hover:text-orange-600">{p.name}</Link>{p.is_demo && <Badge tone="amber" className="ml-2">DEMO</Badge>}
                      <p className="text-xs text-slate-500">{formatDate(p.updated_at)} · {units.area(p.total_built_up_area)}</p></div>
                    <span className="text-sm tabular-nums text-slate-600">{p.latest_total_cost != null ? formatMoney(p.latest_total_cost, p.currency) : 'Not estimated'}</span>
                  </li>))}
              </ul>
            </Card>
            <Card className="min-w-0">
              <CardHeader title="Recent reports" action={<Link className="text-sm text-orange-600 hover:underline" to="/reports">All reports</Link>} />
              {data.recent_reports.length === 0 ? <CardBody><p className="text-sm text-slate-500">No reports generated yet.</p></CardBody> : (
                <ul className="divide-y divide-slate-100">{data.recent_reports.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="min-w-0 truncate font-medium">{r.file_name}</span><span className="shrink-0 text-slate-500">{formatDate(r.created_at)}</span></li>))}</ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}
