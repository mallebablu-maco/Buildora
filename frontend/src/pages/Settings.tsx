import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { ErrorState, Spinner } from '@/components/ui/feedback'
import { Field, Input, Select } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/page'
import { useAuth } from '@/features/auth/useAuth'
import { useAsync } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { LIMITS as L } from '@/lib/limits'
import { useToast } from '@/lib/toast'
import { useUnits, type UnitSystem } from '@/lib/units'

/** Wastage allowances used for new estimates (the same recommended values the estimator starts with). */
const WASTAGE_FIELDS = [
  ['cement', 'OPC cement', 3], ['steel', 'TMT steel', 5], ['bricks', 'Bricks', 5], ['blocks', 'Blocks', 5],
  ['sand', 'Sand', 5], ['aggregates', 'Aggregate', 5], ['tiles', 'Tiles', 7], ['paint', 'Paint', 5],
] as const

export default function SettingsPage() {
  const { signOut } = useAuth()
  const toast = useToast()
  const units = useUnits()
  const navigate = useNavigate()
  const { data: profile, loading, error, reload } = useAsync(() => api.profile(), [])
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [wastage, setWastage] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    setName(profile.full_name)
    setCity(profile.default_city)
    setWastage(Object.fromEntries(WASTAGE_FIELDS.map(([k, , d]) => [k, String(profile.default_wastage?.[k] ?? d)])))
  }, [profile])

  if (loading && !profile) return <Spinner />
  if (error || !profile) return <ErrorState message={error ?? 'Could not load your settings.'} onRetry={reload} />

  const save = async () => {
    if (!name.trim()) { toast.error('Name cannot be empty.'); return }
    const parsed: Record<string, number> = {}
    for (const [k, label] of WASTAGE_FIELDS) {
      const v = Number(wastage[k])
      if (!Number.isFinite(v) || v < 0 || v > L.MAX_WASTAGE_PCT) { toast.error(`${label}: wastage must be between 0 and ${L.MAX_WASTAGE_PCT} %.`); return }
      parsed[k] = v
    }
    setBusy(true)
    try {
      await api.updateProfile({ full_name: name.trim(), default_city: city.trim(), default_wastage: parsed })
      toast.success('Settings saved. New projects use these defaults.')
      await reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save your settings.') } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Settings" description="Defaults apply to new projects. Existing projects keep their own values."
        actions={<Button variant="accent" loading={busy} onClick={save}>Save changes</Button>} />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader title="Profile" description="Your name is shown on reports as “Prepared by”." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={L.PERSON_NAME} /></Field>
            <Field label="Email"><Input value={profile.email} disabled readOnly /></Field>
            <Field label="Default city" hint="Pre-filled when you create a project."><Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={L.CITY} /></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Currency & units" description="Quantities and costs use these throughout. Data is always stored in metres and square metres." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" hint="Prices are in Indian rupees for now."><Input value="INR (₹) · Indian numbering 1,00,000" disabled readOnly /></Field>
            <Field label="Display units"><Select value={units.system} onChange={(e) => units.setSystem(e.target.value as UnitSystem)}>
              <option value="metric">Metric (m, m²)</option><option value="imperial">Imperial (ft, sq ft)</option></Select></Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Default wastage" description="Percentage added to the net quantity of each material in new estimates. You can still change each project's wastage on the estimate."
            action={<Button variant="outline" size="sm" onClick={() => setWastage(Object.fromEntries(WASTAGE_FIELDS.map(([k, , d]) => [k, String(d)])))}>Restore recommended defaults</Button>} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            {WASTAGE_FIELDS.map(([k, label]) => (
              <Field key={k} label={`${label} (%)`}><Input type="number" min={0} max={L.MAX_WASTAGE_PCT} step="any" value={wastage[k] ?? ''} onChange={(e) => setWastage((w) => ({ ...w, [k]: e.target.value }))} /></Field>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Demo data" description="Adds a clearly labelled demonstration project so you can explore every feature." />
          <CardBody><Button variant="outline" loading={demoBusy} onClick={async () => {
            setDemoBusy(true)
            try { const p = await api.seedDemo(); toast.success('Demo project created.'); navigate(`/studio/${p.id}`) } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') } finally { setDemoBusy(false) }
          }}>Create demo project</Button></CardBody>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <CardBody><Button variant="danger-outline" onClick={() => void signOut()}>Log out</Button></CardBody>
        </Card>
      </div>
    </>
  )
}
