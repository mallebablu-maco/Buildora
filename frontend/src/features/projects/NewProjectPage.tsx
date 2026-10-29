import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { PageHeader } from '@/components/ui/page'
import { useAuth } from '@/features/auth/useAuth'
import { formatArea, formatLength, formatMoney } from '@/lib/format'
import { MoneyInput } from '@/components/ui/money'
import { LIMITS as L } from '@/lib/limits'
import { rangeHint } from '@/lib/validate'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useCreateProject } from './hooks'
import { DEFAULT_ROOM, defaultWizardValues, STEP_FIELDS, toPayload, wizardSchema, type WizardValues } from './schemas'
import { BUILDING_TYPES, buildingTypeLabel, ROOM_TYPES, roomTypeLabel } from './types'

const STEPS = [
  { key: 'details', title: 'Project details', fields: STEP_FIELDS.details },
  { key: 'building', title: 'Building input', fields: STEP_FIELDS.building },
  { key: 'rooms', title: 'Rooms', fields: STEP_FIELDS.rooms },
  { key: 'review', title: 'Review', fields: [] as readonly string[] },
] as const

const num = { valueAsNumber: true } as const

const BUILDING_HINT = {
  length: rangeHint(L.MIN_DIM, L.MAX_DIM, 'm'), width: rangeHint(L.MIN_DIM, L.MAX_DIM, 'm'), height: rangeHint(L.MIN_HEIGHT, L.MAX_HEIGHT, 'm'),
  wall_thickness: rangeHint(L.MIN_WALL, L.MAX_WALL, 'm'), slab_thickness: rangeHint(L.MIN_SLAB, L.MAX_SLAB, 'm'),
} as const

export default function NewProjectPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const create = useCreateProject()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const { register, control, handleSubmit, trigger, getValues, formState: { errors } } = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    mode: 'onChange',
    defaultValues: defaultWizardValues((user?.user_metadata?.full_name as string | undefined) ?? ''),
  })
  const rooms = useFieldArray({ control, name: 'rooms' })

  const save = async (values: WizardValues) => {
    setError(null)
    try {
      const project = await create.mutateAsync(toPayload(values))
      toast.success('Project saved.')
      navigate(`/projects/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the project.')
    }
  }

  const next = async () => {
    if (await trigger([...STEPS[step].fields] as never)) setStep((s) => s + 1)
  }

  /** "Save as draft & exit": needs the details and the building to be valid; rooms are saved if they are valid. */
  const saveDraft = async () => {
    for (const [i, s] of STEPS.slice(0, 3).entries()) {
      if (!(await trigger([...s.fields] as never))) { setStep(i); return }
    }
    await handleSubmit(save)()
  }

  const stepErrors = (i: number) => STEPS[i].fields.some((f) => f in errors)
  const v = getValues()

  return (
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Projects" className="mb-2 text-sm text-slate-500"><Link to="/projects" className="underline">My Projects</Link> / New project</nav>
      <PageHeader
        title="New project"
        description="Four steps. You can come back and change anything later."
        actions={<Button variant="outline" onClick={saveDraft} loading={create.isPending}>Save as draft &amp; exit</Button>}
      />

      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === step ? 'step' : undefined}
            className={cn('flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm', i === step ? 'border-brand-500' : 'border-slate-200', stepErrors(i) && 'border-red-400')}>
            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-brand-500 text-navy-900' : 'border border-slate-300 text-slate-600')}>
              {i < step ? <Check className="h-3.5 w-3.5" aria-label="done" /> : i + 1}
            </span>
            <span className={cn('font-medium', i === step ? 'text-navy-900' : 'text-slate-600')}><span className="sr-only">Step {i + 1} of 4: </span>{s.title}</span>
          </li>
        ))}
      </ol>

      <form noValidate onSubmit={(e) => { e.preventDefault() }}>
        <Card className="p-5 sm:p-6">
          {error && <Alert tone="error" className="mb-4">{error}</Alert>}

          {step === 0 && (
            <section aria-labelledby="s1" className="space-y-4">
              <div><h2 id="s1" className="text-lg font-bold text-navy-900">Project details</h2><p className="text-sm text-slate-600">Basic information that appears on your estimate and report.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Project name" error={errors.name?.message} hint={`Up to ${L.PROJECT_NAME} characters`}>
                  {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} maxLength={L.PROJECT_NAME} {...register('name')} />}
                </Field>
                <Field label="Owner" error={errors.owner_name?.message} hint={`Letters only, up to ${L.OWNER_NAME} characters`}>
                  {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} maxLength={L.OWNER_NAME} {...register('owner_name')} />}
                </Field>
              </div>
              <Field label="Description (optional)" error={errors.description?.message} hint={`Up to ${L.DESCRIPTION} characters`}>
                {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} invalid={invalid} maxLength={L.DESCRIPTION} {...register('description')} />}
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Building type" error={errors.building_type?.message}>
                  {({ id, invalid }) => <Select id={id} invalid={invalid} {...register('building_type')}>{BUILDING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>}
                </Field>
                <Field label="Location (city)" error={errors.location?.message} hint={`Up to ${L.LOCATION} characters`}>
                  {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} invalid={invalid} maxLength={L.LOCATION} {...register('location')} />}
                </Field>
                <Field label="Floors" error={errors.floors?.message} hint={`${rangeHint(1, L.MAX_FLOORS)} (1 = ground floor only)`}>
                  {({ id, describedBy, invalid }) => <Input id={id} type="number" min={1} max={L.MAX_FLOORS} step={1} aria-describedby={describedBy} invalid={invalid} {...register('floors', num)} />}
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Currency" hint="Prices are in Indian rupees for now." hintAlways>
                  {({ id }) => <Input id={id} value="INR (₹)" disabled readOnly />}
                </Field>
                <Field label="Budget (optional)" error={errors.budget?.message} hint={`Optional, up to ${L.MAX_BUDGET.toLocaleString('en-IN')}. Used to show over / under against the estimate.`}>
                  {({ id, describedBy, invalid }) => (
                    <Controller control={control} name="budget" render={({ field }) => (
                      <MoneyInput id={id} aria-describedby={describedBy} invalid={invalid} placeholder="e.g. 20,00,000"
                        value={field.value == null || Number.isNaN(field.value) ? '' : String(field.value)}
                        onValueChange={(raw) => field.onChange(raw === '' ? null : Number(raw))} onBlur={field.onBlur} />
                    )} />
                  )}
                </Field>
              </div>
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="s2" className="space-y-4">
              <div><h2 id="s2" className="text-lg font-bold text-navy-900">Building input</h2><p className="text-sm text-slate-600">Outer dimensions in metres (centre-line). You will be able to upload a floor plan in the 3D Studio later.</p></div>
              <div className="grid gap-4 sm:grid-cols-3">
                {([
                  ['length', 'Length (m)'], ['width', 'Width (m)'], ['height', 'Floor height (m)'], ['wall_thickness', 'External wall thickness (m)'], ['slab_thickness', 'Slab thickness (m)'],
                ] as const).map(([name, label]) => (
                  <Field key={name} label={label} error={errors[name]?.message} hint={BUILDING_HINT[name]}>
                    {({ id, describedBy, invalid }) => <Input id={id} type="number" min={0} step="any" aria-describedby={describedBy} invalid={invalid} {...register(name, num)} />}
                  </Field>
                ))}
              </div>
              {Number.isFinite(v.length * v.width) && v.length > 0 && v.width > 0 && (
                <p className="text-sm text-slate-600">Footprint {formatArea(v.length * v.width)} per floor, {formatArea(v.length * v.width * (Number(v.floors) || 1))} in total.</p>
              )}
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="s3" className="space-y-4">
              <div><h2 id="s3" className="text-lg font-bold text-navy-900">Rooms</h2><p className="text-sm text-slate-600">Optional: you can skip this step and add rooms later.</p></div>
              {rooms.fields.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">No rooms yet.</p>}
              <div className="space-y-3">
                {rooms.fields.map((f, i) => {
                  const e = errors.rooms?.[i]
                  return (
                    <fieldset key={f.id} className="rounded-lg border border-slate-200 p-3">
                      <legend className="px-1 text-sm font-semibold text-navy-900">Room {i + 1}</legend>
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Field label="Name" error={e?.name?.message} hint={`Up to ${L.ROOM_NAME} characters`}>{({ id, invalid }) => <Input id={id} invalid={invalid} maxLength={L.ROOM_NAME} {...register(`rooms.${i}.name`)} />}</Field>
                        <Field label="Type" error={e?.room_type?.message}>{({ id, invalid }) => <Select id={id} invalid={invalid} {...register(`rooms.${i}.room_type`)}>{ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>}</Field>
                        <Field label="Floor" error={e?.floor_number?.message} hint={rangeHint(1, L.MAX_FLOORS)}>{({ id, invalid }) => <Input id={id} type="number" step={1} min={1} max={L.MAX_FLOORS} invalid={invalid} {...register(`rooms.${i}.floor_number`, num)} />}</Field>
                        <div className="flex items-end justify-end"><Button variant="ghost" size="sm" onClick={() => rooms.remove(i)} aria-label={`Remove room ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden="true" /> Remove</Button></div>
                        <Field label="Length (m)" error={e?.length?.message} hint={rangeHint(L.MIN_ROOM_DIM, L.MAX_ROOM_DIM, 'm')}>{({ id, invalid }) => <Input id={id} type="number" min={L.MIN_ROOM_DIM} max={L.MAX_ROOM_DIM} step="any" invalid={invalid} {...register(`rooms.${i}.length`, num)} />}</Field>
                        <Field label="Width (m)" error={e?.width?.message} hint={rangeHint(L.MIN_ROOM_DIM, L.MAX_ROOM_DIM, 'm')}>{({ id, invalid }) => <Input id={id} type="number" min={L.MIN_ROOM_DIM} max={L.MAX_ROOM_DIM} step="any" invalid={invalid} {...register(`rooms.${i}.width`, num)} />}</Field>
                        <Field label="Doors" error={e?.doors?.message} hint={rangeHint(0, L.MAX_DOORS_PER_ROOM)}>{({ id, invalid }) => <Input id={id} type="number" step={1} min={0} max={L.MAX_DOORS_PER_ROOM} invalid={invalid} {...register(`rooms.${i}.doors`, num)} />}</Field>
                        <Field label="Windows" error={e?.windows?.message} hint={rangeHint(0, L.MAX_WINDOWS_PER_ROOM)}>{({ id, invalid }) => <Input id={id} type="number" step={1} min={0} max={L.MAX_WINDOWS_PER_ROOM} invalid={invalid} {...register(`rooms.${i}.windows`, num)} />}</Field>
                      </div>
                    </fieldset>
                  )
                })}
              </div>
              {typeof errors.rooms?.message === 'string' && <p role="alert" className="text-sm text-red-700">{errors.rooms.message}</p>}
              <Button variant="outline" onClick={() => rooms.append({ ...DEFAULT_ROOM, name: `Room ${rooms.fields.length + 1}` })}><Plus className="h-4 w-4" aria-hidden="true" /> Add room</Button>
            </section>
          )}

          {step === 3 && (
            <section aria-labelledby="s4" className="space-y-4">
              <div><h2 id="s4" className="text-lg font-bold text-navy-900">Review</h2><p className="text-sm text-slate-600">Check everything, then create the project.</p></div>
              <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-slate-500">Name</dt><dd className="font-medium">{v.name}</dd>
                <dt className="text-slate-500">Owner</dt><dd>{v.owner_name || '—'}</dd>
                <dt className="text-slate-500">Type</dt><dd>{buildingTypeLabel(v.building_type)}</dd>
                <dt className="text-slate-500">Location</dt><dd>{v.location || '—'}</dd>
                <dt className="text-slate-500">Floors</dt><dd>{v.floors}</dd>
                <dt className="text-slate-500">Budget</dt><dd>{v.budget ? formatMoney(v.budget) : '—'}</dd>
                <dt className="text-slate-500">Footprint</dt><dd>{formatLength(v.length)} × {formatLength(v.width)} = {formatArea(v.length * v.width)}</dd>
                <dt className="text-slate-500">Floor height</dt><dd>{formatLength(v.height)}</dd>
                <dt className="text-slate-500">Walls / slab</dt><dd>{formatLength(v.wall_thickness)} / {formatLength(v.slab_thickness)}</dd>
                <dt className="text-slate-500">Rooms</dt><dd>{v.rooms.length ? v.rooms.map((r) => `${r.name} (${roomTypeLabel(r.room_type)}, floor ${r.floor_number})`).join('; ') : 'None yet'}</dd>
              </dl>
            </section>
          )}
        </Card>

        <div className="mt-4 flex items-center justify-between">
          {step === 0
            ? <Link to="/projects"><Button variant="outline">Cancel</Button></Link>
            : <Button variant="outline" onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</Button>}
          {step < 3
            ? <Button variant="accent" onClick={next}>Next: {STEPS[step + 1].title} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
            : <Button variant="accent" loading={create.isPending} onClick={handleSubmit(save)}>Create project</Button>}
        </div>
      </form>
    </div>
  )
}
