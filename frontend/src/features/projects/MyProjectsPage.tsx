import { FolderPlus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Alert, Spinner } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { formatArea, formatUpdated } from '@/lib/format'
import { useToast } from '@/lib/toast'
import { useDeleteProject, useProjects } from './hooks'
import { buildingTypeLabel, type Project } from './types'

export default function MyProjectsPage() {
  const { data: projects, isPending, error, refetch } = useProjects()
  const remove = useDeleteProject()
  const toast = useToast()
  const [toDelete, setToDelete] = useState<Project | null>(null)

  const confirmDelete = () => {
    if (!toDelete) return
    remove.mutate(toDelete.id, {
      onSuccess: () => { toast.success(`"${toDelete.name}" was deleted.`); setToDelete(null) },
      onError: (e) => { toast.error(e.message); setToDelete(null) },
    })
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My Projects"
        description={projects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : undefined}
        actions={<Link to="/projects/new"><Button variant="accent"><Plus className="h-4 w-4" aria-hidden="true" /> New Project</Button></Link>}
      />

      {isPending && <Spinner label="Loading your projects…" />}
      {error && (
        <Alert tone="error" title="Could not load your projects">
          <p>{error.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void refetch()}>Try again</Button>
        </Alert>
      )}

      {projects && projects.length === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FolderPlus className="h-10 w-10 text-brand-600" aria-hidden="true" />
          <h2 className="text-lg font-bold text-navy-900">No projects yet — create your first project</h2>
          <p className="max-w-md text-sm text-slate-600">Enter the building's dimensions and rooms to get started.</p>
          <Link to="/projects/new"><Button variant="accent">Create project</Button></Link>
        </Card>
      )}

      {projects && projects.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {['Project', 'Location', 'Type', 'Floors', 'Built-up', 'Rooms', 'Updated'].map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}
                <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium"><Link to={`/projects/${p.id}`} className="text-navy-700 underline underline-offset-2">{p.name}</Link></td>
                  <td className="px-4 py-3">{p.location || '—'}</td>
                  <td className="px-4 py-3">{buildingTypeLabel(p.building_type)}</td>
                  <td className="px-4 py-3">{p.floors}</td>
                  <td className="px-4 py-3">{formatArea(p.total_built_up_area)}</td>
                  <td className="px-4 py-3">{p.room_count}</td>
                  <td className="px-4 py-3 text-slate-600">{formatUpdated(p.updated_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link to={`/projects/${p.id}`}><Button variant="outline" size="sm">Open</Button></Link>
                      <Button variant="outline" size="sm" aria-label={`Delete ${p.name}`} onClick={() => setToDelete(p)}><Trash2 className="h-3.5 w-3.5 text-red-700" aria-hidden="true" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog
        open={!!toDelete} title={`Delete “${toDelete?.name ?? ''}”?`} confirmLabel="Delete project" busy={remove.isPending}
        message="Its rooms and everything saved with it will be removed. This can't be undone."
        onConfirm={confirmDelete} onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
