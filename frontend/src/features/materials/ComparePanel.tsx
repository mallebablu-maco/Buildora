import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Alert, Badge, EmptyState } from '@/components/ui/feedback'
import { Select } from '@/components/ui/form'
import { ProjectPicker } from '@/components/ui/page'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { cn, formatMoney, formatNumber, KEY_LABEL, PRICED_KEYS } from '@/lib/utils'
import type { Estimate, Material, Project } from '@/types'

/** Compare the options for one material type against a project's quantity, and pick the one the project uses. */
export function ComparePanel({ materials, projects }: { materials: Material[]; projects: Project[] }) {
  const toast = useToast()
  const [key, setKey] = useState<string>('cement')
  const [pid, setPid] = useState<string | undefined>(projects[0]?.id)
  const [est, setEst] = useState<Estimate | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!pid) return
    let live = true
    setErr(null)
    api.runEstimate(pid).then((e) => { if (live) setEst(e) })
      .catch((e) => { if (live) { setEst(null); setErr(e instanceof Error ? e.message : 'Could not load the project estimate.') } })
    return () => { live = false }
  }, [pid])

  const alts = materials.filter((m) => m.estimate_key === key)
  const item = est?.items.find((i) => i.key === key)
  const qty = item?.gross_quantity ?? null
  const priced = alts.filter((m) => m.unit_price != null)
  const lowest = priced.length ? Math.min(...priced.map((m) => m.unit_price as number)) : null
  const currentId = item?.material_id
  const cur = projects.find((p) => p.id === pid)?.currency ?? 'INR'

  const choose = async (m: Material) => {
    if (!pid) return
    try {
      await api.updateConfig(pid, { material_selections: { [key]: m.id } })
      setEst(await api.runEstimate(pid))
      toast.success(`${m.name} selected for this project. Estimate recalculated.`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not select the material.') }
  }

  return (
    <Card>
      <CardHeader title="Compare alternatives" description="See each option's effect on the total project cost using the selected project's quantity."
        action={<div className="flex flex-wrap gap-2"><Select value={key} onChange={(e) => setKey(e.target.value)} className="w-40" aria-label="Material type to compare">{PRICED_KEYS.map((k) => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}</Select>
          {projects.length > 0 && <ProjectPicker projects={projects} value={pid} onChange={setPid} />}</div>} />
      <CardBody>
        {projects.length === 0 ? <p className="text-sm text-slate-500">Create a project to compare costs against its quantities. <Link className="text-orange-600 underline" to="/projects/new">New project</Link></p> : err ? <Alert tone="error">{err}</Alert> : (
          <>
            <p className="mb-3 text-sm text-slate-600">Project requirement: <strong>{qty != null ? `${formatNumber(qty)} ${item?.unit}` : '—'}</strong> (incl. wastage). The lowest price is highlighted for convenience only — it is <strong>not</strong> a recommendation on quality.</p>
            {alts.length === 0 ? <EmptyState title="No alternatives" description="Add materials of this type to compare." /> : (
              <Table className="min-w-[60rem]">
                <THead><TR><TH>Option</TH><TH>Brand</TH><TH>Grade</TH><TH>Specification</TH><TH>Durability notes</TH><TH>Supplier</TH><TH className="text-right">Price / unit</TH><TH className="text-right">Cost for this project</TH><TH /></TR></THead>
                <TBody>{alts.map((m) => {
                  const cost = m.unit_price != null && qty != null ? m.unit_price * qty : null
                  const isLow = m.unit_price != null && m.unit_price === lowest && priced.length > 1
                  return (
                    <TR key={m.id} className={cn(isLow && 'bg-emerald-50/60')}>
                      <TD className="min-w-44 break-words font-medium">{m.name}{isLow && <Badge tone="green" className="ml-2">Lowest price</Badge>}{m.id === currentId && <Badge tone="navy" className="ml-2">Selected</Badge>}</TD>
                      <TD>{m.brand || '—'}</TD><TD>{m.grade || '—'}</TD><TD className="max-w-48 text-xs text-slate-600">{m.specification || '—'}</TD><TD className="max-w-48 text-xs text-slate-600">{m.durability_notes || '—'}</TD>
                      <TD>{m.supplier || '—'}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{m.unit_price != null ? formatMoney(m.unit_price, cur, 2) : <Badge tone="red">no price</Badge>}{m.price_is_sample && <Badge tone="amber" className="ml-1">SAMPLE</Badge>}</TD>
                      <TD className="text-right font-medium tabular-nums">{cost != null ? formatMoney(cost, cur) : '—'}</TD>
                      <TD><Button size="sm" variant={m.id === currentId ? 'outline' : 'primary'} disabled={m.id === currentId} onClick={() => choose(m)}>{m.id === currentId ? 'In use' : 'Use in project'}</Button></TD>
                    </TR>)
                })}</TBody>
              </Table>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
