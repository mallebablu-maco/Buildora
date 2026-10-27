import type { ReactNode } from 'react'
import type { Project } from '@/types'
import { Select } from './form'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function ProjectPicker({ projects, value, onChange }: { projects: Project[]; value?: string; onChange: (id: string) => void }) {
  return (
    <Select aria-label="Select project" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="w-56">
      {projects.map((p) => <option key={p.id} value={p.id}>{p.is_demo ? '[DEMO] ' : ''}{p.name}</option>)}
    </Select>
  )
}
