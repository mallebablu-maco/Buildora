import { Box, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Alert, Spinner } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { ApiError } from '@/lib/api'
import { formatArea, formatLength, formatMoney } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { useDeleteProject, useProject } from './hooks'
import { buildingTypeLabel, roomTypeLabel } from './types'

export default function ProjectPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: p, isPending, error, refetch } = useProject(id)
  const remove = useDeleteProject()
  const [confirm, setConfirm] = useState(false)

  if (isPending) return <Spinner label="Loading the project…" />
  if (error || !p) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 422)
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Alert tone={missing ? 'warning' : 'error'} title={missing ? 'Project not found' : 'Could not load the project'}>
          {missing ? 'It may have been deleted, or it belongs to another account.' : error?.message}
        </Alert>
        <div className="flex gap-2">
          {!missing && <Button variant="outline" onClick={() => void refetch()}>Try again</Button>}
          <Link to="/projects"><Button variant="outline">Back to My Projects</Button></Link>
        </div>
      </div>
    )
  }

  const floors = Array.from({ length: p.floors }, (_, i) => i + 1)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav aria-label="Projects" className="text-sm text-slate-500"><Link to="/projects" className="underline">My Projects</Link> / {p.name}</nav>
      <PageHeader
        title={p.name}
        description={p.description || undefined}
        actions={<>
          <Button variant="outline" disabled title="Arrives in the next phase"><Box className="h-4 w-4" aria-hidden="true" /> 3D Studio (coming soon)</Button>
          <Button variant="outline" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4 text-red-700" aria-hidden="true" /> Delete</Button>
        </>}
      />

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-navy-900">Building</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {([
            ['Type', buildingTypeLabel(p.building_type)], ['Location', p.location || '—'], ['Owner', p.owner_name || '—'],
            ['Budget', p.budget ? formatMoney(p.budget, p.currency) : '—'], ['Floors', String(p.floors)],
            ['Footprint', `${formatLength(p.length)} × ${formatLength(p.width)} = ${formatArea(p.floor_area)}`],
            ['Total built-up', formatArea(p.total_built_up_area)], ['Floor height', formatLength(p.height)],
            ['Walls / slab', `${formatLength(p.wall_thickness)} / ${formatLength(p.slab_thickness)}`],
          ] as const).map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{val}</dd></div>
          ))}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-navy-900">Rooms ({p.rooms.length})</h2>
        {p.rooms.length === 0 ? (
          <p className="text-sm text-slate-600">No rooms yet.</p>
        ) : (
          <div className="space-y-4">
            {floors.map((f) => {
              const rooms = p.rooms.filter((r) => r.floor_number === f)
              if (!rooms.length) return null
              return (
                <div key={f} className="overflow-x-auto">
                  <h3 className="mb-1 text-sm font-semibold text-slate-700">Floor {f}</h3>
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500"><tr>{['Room', 'Type', 'Size', 'Area', 'Doors', 'Windows'].map((h) => <th key={h} scope="col" className="py-1 pr-4 font-semibold">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {rooms.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1.5 pr-4 font-medium">{r.name}</td><td className="pr-4">{roomTypeLabel(r.room_type)}</td>
                          <td className="pr-4">{formatLength(r.length)} × {formatLength(r.width)}</td><td className="pr-4">{formatArea(r.area)}</td>
                          <td className="pr-4">{r.doors}</td><td>{r.windows}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm} title={`Delete “${p.name}”?`} confirmLabel="Delete project" busy={remove.isPending}
        message="Its rooms and everything saved with it will be removed. This can't be undone."
        onCancel={() => setConfirm(false)}
        onConfirm={() => remove.mutate(p.id, {
          onSuccess: () => { toast.success(`"${p.name}" was deleted.`); navigate('/projects', { replace: true }) },
          onError: (e) => { toast.error(e.message); setConfirm(false) },
        })}
      />
    </div>
  )
}
