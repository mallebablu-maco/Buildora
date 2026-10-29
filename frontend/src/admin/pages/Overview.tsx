import { FileText, FolderKanban, Users, UserPlus } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardBody, CardHeader, Stat } from '@/components/ui/card'
import { ErrorState, Spinner } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { PALETTE } from '@/features/pricing/charts'
import { useAsync } from '@/hooks/useApi'
import { formatNumber } from '@/lib/utils'
import { adminApi } from '../adminApi'

const PROVIDER_LABEL: Record<string, string> = { email: 'Email', google: 'Google' }

export default function Overview() {
  const { data, loading, error, reload } = useAsync(() => adminApi.overview(), [])
  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorState message={error ?? 'Could not load the overview.'} onRetry={reload} />
  const roles = [
    { name: 'Homeowners', value: data.homeowners }, { name: 'Contractors', value: data.contractors }, { name: 'No role chosen', value: data.no_role },
  ].filter((r) => r.value > 0)
  const days = data.signups_per_day.map((d) => ({ day: new Date(d.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), count: d.count }))
  return (
    <>
      <PageHeader title="Overview" description="Who uses Buildora and how much. Numbers are live from the database." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={formatNumber(data.users_total, 0)} hint={`${data.homeowners} homeowners · ${data.contractors} contractors`} icon={<Users className="h-4 w-4" />} />
        <Stat label="New sign-ups" value={formatNumber(data.new_7d, 0)} hint={`last 7 days · ${data.new_30d} in 30 days`} icon={<UserPlus className="h-4 w-4" />} />
        <Stat label="Active users" value={formatNumber(data.active_7d, 0)} hint={`logged in, last 7 days · ${data.active_30d} in 30 days`} icon={<Users className="h-4 w-4" />} />
        <Stat label="Projects" value={formatNumber(data.projects, 0)} hint={`${data.estimates} estimates · ${data.reports} reports`} icon={<FolderKanban className="h-4 w-4" />} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Sign-ups per day" description="Last 30 days" />
          <CardBody>
            <div className="h-64" role="img" aria-label="Sign-ups per day, last 30 days">
              <ResponsiveContainer>
                <BarChart data={days}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                  <Tooltip />
                  <Bar dataKey="count" name="Sign-ups" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Users by role" description="Chosen at sign-up" />
          <CardBody>
            {roles.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No users yet.</p> : (
              <div className="h-64" role="img" aria-label="Users by role">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={roles} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                      {roles.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="How people log in" description="One person can use more than one method." />
        <CardBody className="flex flex-wrap gap-6">
          {Object.entries(data.by_provider).map(([p, n]) => (
            <div key={p}><p className="text-sm text-slate-500">{PROVIDER_LABEL[p] ?? p}</p><p className="text-2xl font-semibold text-navy-900">{n}</p></div>
          ))}
          <div className="flex items-center gap-2 text-sm text-slate-500"><FileText className="h-4 w-4" aria-hidden="true" /> "Active" means logged in during the period; someone who stays logged in for weeks may not count as a new login.</div>
        </CardBody>
      </Card>
    </>
  )
}
