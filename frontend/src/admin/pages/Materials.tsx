import { Download, EyeOff, Eye, Pencil, Plus, Save, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea, Under } from '@/components/ui/form'
import { MoneyInput } from '@/components/ui/money'
import { PageHeader } from '@/components/ui/page'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useAsync } from '@/hooks/useApi'
import { saveBlob } from '@/lib/api'
import { LIMITS as L } from '@/lib/limits'
import { useToast } from '@/lib/toast'
import { formatDate, KEY_LABEL, PRICED_KEYS } from '@/lib/utils'
import { numberError, textError } from '@/lib/validate'
import { adminApi, type AdminMaterial, type MaterialDetails } from '../adminApi'

const TEMPLATE = 'name,unit_price,supplier,location\nOrdinary Portland Cement 43,420,Market survey,Hyderabad\n'

export default function MaterialsPage() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(() => adminApi.materials(), [])
  const [key, setKey] = useState('all')
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(true)
  const [edit, setEdit] = useState<{ m: AdminMaterial | null } | null>(null)
  const [hide, setHide] = useState<AdminMaterial | null>(null)
  const [busyHide, setBusyHide] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorState message={error ?? 'Could not load materials.'} onRetry={reload} />
  const list = data.filter((m) => (key === 'all' || m.estimate_key === key) && (showHidden || !m.is_hidden)
    && `${m.name} ${m.brand} ${m.grade} ${m.category}`.toLowerCase().includes(q.trim().toLowerCase()))
  const samples = data.filter((m) => m.price_is_sample && !m.is_hidden).length

  const importCsv = async (f: File | undefined) => {
    if (!f) return
    setImporting(true)
    try {
      const r = await adminApi.importPrices(f)
      if (r.errors.length) toast.error(`Updated ${r.updated} price(s). ${r.errors.length} row(s) skipped, e.g. line ${r.errors[0].line}: ${r.errors[0].message}`)
      else toast.success(`Updated ${r.updated} market price(s).`)
      await reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Import failed.') } finally { setImporting(false) }
  }

  return (
    <>
      <PageHeader title="Materials & market prices" description="The shared catalogue every user sees. A market price you save is used in everyone's estimates, unless a user set their own price."
        actions={<>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = '' }} />
          <Button variant="outline" onClick={() => saveBlob(new Blob([TEMPLATE], { type: 'text/csv' }), 'buildora_market_prices.csv')}><Download className="h-4 w-4" /> CSV template</Button>
          <Button variant="outline" loading={importing} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import prices</Button>
          <Button variant="accent" onClick={() => setEdit({ m: null })}><Plus className="h-4 w-4" /> Add material</Button>
        </>} />
      {samples > 0 && <Alert tone="warning" title={`${samples} price(s) are still placeholders`}>Users see these marked SAMPLE. Save a real market price to replace them.</Alert>}
      <div className="my-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search materials…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search materials" />
        <Select value={key} onChange={(e) => setKey(e.target.value)} className="w-48" aria-label="Filter by type"><option value="all">All types</option>{PRICED_KEYS.map((k) => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-orange-500" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden</label>
      </div>
      {list.length === 0 ? <EmptyState title="No materials match" /> : (
        <Card><Table className="min-w-[64rem]">
          <THead><TR><TH className="w-64">Material</TH><TH>Type</TH><TH>Unit</TH><TH className="w-44">Market price (₹)</TH><TH>Status</TH><TH>Price updated</TH><TH /></TR></THead>
          <TBody>{list.map((m) => <Row key={`${m.id}-${m.price_updated_at}-${m.is_hidden}`} m={m} onChanged={reload} onEdit={() => setEdit({ m })} onHide={() => setHide(m)} />)}</TBody>
        </Table></Card>
      )}
      <MaterialDialog open={!!edit} material={edit?.m ?? null} onClose={() => setEdit(null)} onSaved={reload} />
      <ConfirmDialog open={!!hide} title={hide?.is_hidden ? 'Show this material again?' : 'Hide this material?'} confirmLabel={hide?.is_hidden ? 'Show' : 'Hide'} busy={busyHide}
        message={hide?.is_hidden ? `“${hide?.name}” will be offered to users again.` : `“${hide?.name}” will no longer be offered to users or used in new calculations. Nothing is deleted; you can show it again.`}
        onCancel={() => setHide(null)}
        onConfirm={async () => {
          if (!hide) return
          setBusyHide(true)
          try { await adminApi.setHidden(hide.id, !hide.is_hidden); toast.success(hide.is_hidden ? 'Material shown.' : 'Material hidden.'); await reload(); setHide(null) }
          catch (e) { toast.error(e instanceof Error ? e.message : 'Could not change it.') } finally { setBusyHide(false) }
        }} />
    </>
  )
}

function Row({ m, onChanged, onEdit, onHide }: { m: AdminMaterial; onChanged: () => Promise<void>; onEdit: () => void; onHide: () => void }) {
  const toast = useToast()
  const start = m.market_price != null ? String(m.market_price) : ''
  const [price, setPrice] = useState(start)
  const [busy, setBusy] = useState(false)
  const err = numberError(price, 0, L.MAX_UNIT_PRICE)
  const dirty = price !== start
  const save = async () => {
    if (err) return
    setBusy(true)
    try { await adminApi.setPrice(m.id, { unit_price: Number(price), supplier: m.price_is_sample ? '' : m.supplier, location: m.price_is_sample ? '' : m.location }); toast.success(`Market price for ${m.name} saved.`); await onChanged() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the price.') } finally { setBusy(false) }
  }
  return (
    <TR className={m.is_hidden ? 'opacity-60' : undefined}>
      <TD className="break-words font-medium">{m.name}<div className="text-xs font-normal text-slate-500">{[m.brand, m.grade].filter(Boolean).join(' · ')}</div></TD>
      <TD className="whitespace-nowrap">{KEY_LABEL[m.estimate_key] ?? m.estimate_key}</TD>
      <TD className="whitespace-nowrap">{m.unit}</TD>
      <TD className="group">
        <MoneyInput value={price} onValueChange={setPrice} aria-label={`Market price for ${m.name}`} className="h-8" invalid={!!err} />
        <Under error={err} hint="0 to 10,00,000" />
      </TD>
      <TD className="whitespace-nowrap">{m.is_hidden ? <Badge>Hidden</Badge> : m.price_is_sample ? <Badge tone="amber">SAMPLE</Badge> : <Badge tone="green">Market price</Badge>}</TD>
      <TD className="whitespace-nowrap">{formatDate(m.price_updated_at)}</TD>
      <TD className="whitespace-nowrap text-right">
        <Button size="sm" variant={dirty ? 'accent' : 'outline'} disabled={!dirty || !!err} loading={busy} onClick={save}><Save className="h-3.5 w-3.5" /> Save</Button>
        <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} title="Edit details" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={`${m.is_hidden ? 'Show' : 'Hide'} ${m.name}`} title={m.is_hidden ? 'Show again' : 'Hide'} onClick={onHide}>{m.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button>
      </TD>
    </TR>
  )
}

const EMPTY = { estimate_key: 'cement', name: '', category: '', brand: '', grade: '', specification: '', durability_notes: '', unit: '', unit_price: '', supplier: '', location: '' }

function MaterialDialog({ open, material, onClose, onSaved }: { open: boolean; material: AdminMaterial | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast()
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  const marker = open ? material?.id ?? 'new' : null
  if (marker !== opened) { // the dialog was (re)opened: start from the chosen material or an empty form
    setOpened(marker)
    if (open) setF(material ? { ...EMPTY, ...material, unit_price: '', supplier: '', location: '' } : EMPTY)
  }
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const errs = {
    name: textError('material', f.name, { max: L.MATERIAL_NAME, required: 'Enter a name.' }),
    category: textError('title', f.category, { max: L.CATEGORY, required: 'Enter a category.' }),
    unit: textError('unit', f.unit, { max: L.UNIT, required: 'Enter the unit.' }),
    brand: textError('material', f.brand, { max: L.BRAND }),
    grade: textError('grade', f.grade, { max: L.GRADE }),
    unit_price: material ? null : numberError(f.unit_price, 0, L.MAX_UNIT_PRICE),
    supplier: material ? null : textError('title', f.supplier, { max: L.SUPPLIER }),
    location: material ? null : textError('place', f.location, { max: L.PRICE_LOCATION }),
  }
  const invalid = Object.values(errs).some(Boolean)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (invalid) return
    setBusy(true)
    const details: MaterialDetails = { estimate_key: f.estimate_key as MaterialDetails['estimate_key'], name: f.name.trim(), category: f.category.trim(), brand: f.brand.trim(), grade: f.grade.trim(), specification: f.specification, durability_notes: f.durability_notes, unit: f.unit.trim() }
    try {
      if (material) await adminApi.updateMaterial(material.id, details)
      else await adminApi.createMaterial({ ...details, unit_price: Number(f.unit_price), supplier: f.supplier.trim(), location: f.location.trim() })
      toast.success(material ? 'Material updated.' : 'Material added for everyone.')
      await onSaved(); onClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save the material.') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} title={material ? 'Edit material' : 'Add material for everyone'} description={material ? undefined : 'It appears in every user’s catalogue and estimates.'} className="w-[min(44rem,calc(100vw-2rem))]">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Used for estimate line *"><Select value={f.estimate_key} onChange={set('estimate_key')}>{PRICED_KEYS.map((k) => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}</Select></Field>
          <Field label="Name *" error={errs.name} hint={`Up to ${L.MATERIAL_NAME} characters`}><Input value={f.name} onChange={set('name')} maxLength={L.MATERIAL_NAME} invalid={!!errs.name} /></Field>
          <Field label="Category *" error={errs.category}><Input value={f.category} onChange={set('category')} maxLength={L.CATEGORY} invalid={!!errs.category} placeholder="e.g. Cement & Binders" /></Field>
          <Field label="Unit *" error={errs.unit} hint="Must match the estimate unit, e.g. bag (50 kg), kg, m³, nos, litre"><Input value={f.unit} onChange={set('unit')} maxLength={L.UNIT} invalid={!!errs.unit} /></Field>
          <Field label="Brand" error={errs.brand}><Input value={f.brand} onChange={set('brand')} maxLength={L.BRAND} invalid={!!errs.brand} /></Field>
          <Field label="Grade" error={errs.grade}><Input value={f.grade} onChange={set('grade')} maxLength={L.GRADE} invalid={!!errs.grade} /></Field>
          {!material && <>
            <Field label="Market price (₹) *" error={errs.unit_price} hint="0 to 10,00,000"><MoneyInput value={f.unit_price} onValueChange={(v) => setF((s) => ({ ...s, unit_price: v }))} invalid={!!errs.unit_price} /></Field>
            <Field label="Price source" error={errs.supplier} hint="e.g. Market survey, Dealer name"><Input value={f.supplier} onChange={set('supplier')} maxLength={L.SUPPLIER} invalid={!!errs.supplier} /></Field>
            <Field label="Location" error={errs.location}><Input value={f.location} onChange={set('location')} maxLength={L.PRICE_LOCATION} invalid={!!errs.location} /></Field>
          </>}
        </div>
        <Field label="Specification notes"><Textarea value={f.specification} onChange={set('specification')} maxLength={L.SPECIFICATION} /></Field>
        <Field label="Durability notes" hint="Only enter information you can verify."><Textarea value={f.durability_notes} onChange={set('durability_notes')} maxLength={L.NOTES} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" variant="accent" loading={busy} disabled={invalid}>{material ? 'Save changes' : 'Add material'}</Button></div>
      </form>
    </Dialog>
  )
}
