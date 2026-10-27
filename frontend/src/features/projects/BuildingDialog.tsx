import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { api } from '@/lib/api'
import { formatArea } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { Project, ProjectBase } from '@/types'
import { buildingSchema, detailsSchema } from './schemas'
import { BUILDING_TYPES } from './types'
import { z } from 'zod'

const fullSchema = detailsSchema.merge(buildingSchema).extend({
  built_up_area: z.number({ invalid_type_error: 'Enter a number.' }).gt(0, 'Must be more than 0.').max(1_000_000).nullable(),
})
const dimsSchema = buildingSchema.extend({ floors: detailsSchema.shape.floors })
type Values = z.infer<typeof fullSchema>

const num = { valueAsNumber: true } as const
const optional = { setValueAs: (x: unknown) => (x === '' || x == null ? null : Number(x)) } as const

/** Edit a saved project: its details and building dimensions, or only the dimensions (from the 3D Studio). */
export function BuildingDialog({ open, onClose, project, onSaved, dimensionsOnly = false }: {
  open: boolean; onClose: () => void; project: Project; onSaved: () => void; dimensionsOnly?: boolean
}) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(dimensionsOnly ? (dimsSchema as unknown as typeof fullSchema) : fullSchema),
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    reset({
      name: project.name, owner_name: project.owner_name, description: project.description, building_type: project.building_type as Values['building_type'],
      location: project.location, floors: project.floors, budget: project.budget, length: project.length, width: project.width, height: project.height,
      wall_thickness: project.wall_thickness, slab_thickness: project.slab_thickness, built_up_area: project.built_up_area,
    })
  }, [open, project, reset])

  const [l, w] = watch(['length', 'width'])

  const submit = handleSubmit(async (v) => {
    setError(null)
    // the API takes the whole project; fields this dialog does not show keep their saved values
    const body: ProjectBase = {
      name: project.name, description: project.description, owner_name: project.owner_name, building_type: project.building_type,
      location: project.location, floors: project.floors, currency: project.currency, budget: project.budget, length: project.length,
      width: project.width, height: project.height, wall_thickness: project.wall_thickness, slab_thickness: project.slab_thickness, built_up_area: project.built_up_area,
    }
    const changed: Partial<ProjectBase> = dimensionsOnly
      ? { floors: v.floors, length: v.length, width: v.width, height: v.height, wall_thickness: v.wall_thickness, slab_thickness: v.slab_thickness }
      : { ...v }
    try {
      await api.updateProject(project.id, { ...body, ...changed })
      toast.success('Project updated.')
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the project.')
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={dimensionsOnly ? 'Edit building dimensions' : 'Edit project'} className="w-[min(44rem,calc(100vw-2rem))]">
      <form className="space-y-5" onSubmit={submit} noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {!dimensionsOnly && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project name *" error={errors.name?.message} className="sm:col-span-2"><Input invalid={!!errors.name} {...register('name')} /></Field>
            <Field label="Description" error={errors.description?.message} className="sm:col-span-2"><Textarea {...register('description')} /></Field>
            <Field label="Owner / client" error={errors.owner_name?.message}><Input {...register('owner_name')} /></Field>
            <Field label="Building type" error={errors.building_type?.message}>
              <Select {...register('building_type')}>{BUILDING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
            </Field>
            <Field label="Location" error={errors.location?.message}><Input {...register('location')} placeholder="City / region" /></Field>
            <Field label="Budget (optional)" error={errors.budget?.message} hint="Used for budget variance on Cost Analysis."><Input type="number" min={0} step="any" {...register('budget', optional)} /></Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Number of floors *" error={errors.floors?.message}><Input type="number" min={1} step={1} invalid={!!errors.floors} {...register('floors', num)} /></Field>
          <Field label="Building length (m) *" error={errors.length?.message}><Input type="number" step="any" invalid={!!errors.length} {...register('length', num)} /></Field>
          <Field label="Building width (m) *" error={errors.width?.message}><Input type="number" step="any" invalid={!!errors.width} {...register('width', num)} /></Field>
          <Field label="Floor-to-ceiling height (m) *" error={errors.height?.message}><Input type="number" step="any" invalid={!!errors.height} {...register('height', num)} /></Field>
          <Field label="External wall thickness (m) *" error={errors.wall_thickness?.message} hint="0.23 m = standard 9-inch wall"><Input type="number" step="any" invalid={!!errors.wall_thickness} {...register('wall_thickness', num)} /></Field>
          <Field label="Slab thickness (m) *" error={errors.slab_thickness?.message}><Input type="number" step="any" invalid={!!errors.slab_thickness} {...register('slab_thickness', num)} /></Field>
          {!dimensionsOnly && (
            <Field label="Built-up area override (m² per floor)" error={errors.built_up_area?.message}
              hint={Number.isFinite(l * w) ? `Leave blank to use Length × Width = ${formatArea(l * w)}. Override for irregular buildings.` : 'Leave blank to use Length × Width.'}>
              <Input type="number" step="any" {...register('built_up_area', optional)} />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent" loading={isSubmitting}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  )
}
