import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/feedback'
import { Input, Select } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/page'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useAsync } from '@/hooks/useApi'
import { formatDate } from '@/lib/utils'
import { adminApi } from '../adminApi'

const ROLE_LABEL: Record<string, string> = { homeowner: 'Homeowner', contractor: 'Contractor' }
const METHOD_LABEL: Record<string, string> = { email: 'Email', google: 'Google' }

export default function UsersPage() {
  const { data, loading, error, reload } = useAsync(() => adminApi.users(), [])
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorState message={error ?? 'Could not load users.'} onRetry={reload} />
  const list = data.filter((u) => {
    const r = ROLE_LABEL[u.persona] ? u.persona : 'none'
    return (role === 'all' || r === role) && `${u.full_name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase())
  })
  return (
    <>
      <PageHeader title="Users" description="Everyone with a Buildora account, newest first. Passwords are never visible to anyone." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search users" />
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-48" aria-label="Filter by role">
          <option value="all">All roles</option><option value="homeowner">Homeowners</option><option value="contractor">Contractors</option><option value="none">No role chosen</option>
        </Select>
        <span className="self-center text-sm text-slate-500">{list.length} of {data.length}</span>
      </div>
      {list.length === 0 ? <EmptyState title="No users match" description="Change the search or the role filter." /> : (
        <Card><Table className="min-w-[56rem]">
          <THead><TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Logs in with</TH><TH>Joined</TH><TH>Last login</TH><TH className="text-right">Projects</TH></TR></THead>
          <TBody>{list.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">{u.full_name || '—'}{u.is_admin && <Badge tone="orange" className="ml-2">Admin</Badge>}</TD>
              <TD className="break-all">{u.email}{!u.email_confirmed && <Badge tone="amber" className="ml-2">Not confirmed</Badge>}</TD>
              <TD>{ROLE_LABEL[u.persona] ? <Badge tone={u.persona === 'contractor' ? 'navy' : 'green'}>{ROLE_LABEL[u.persona]}</Badge> : <span className="text-slate-400">Not chosen</span>}</TD>
              <TD>{u.providers.map((p) => METHOD_LABEL[p] ?? p).join(', ') || '—'}</TD>
              <TD className="whitespace-nowrap">{formatDate(u.created_at)}</TD>
              <TD className="whitespace-nowrap">{u.last_sign_in_at ? formatDate(u.last_sign_in_at) : 'Never'}</TD>
              <TD className="text-right tabular-nums">{u.projects}</TD>
            </TR>))}
          </TBody>
        </Table></Card>
      )}
    </>
  )
}
