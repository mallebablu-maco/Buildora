import { Download, Save, Undo2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, Badge, ErrorState, Spinner } from '@/components/ui/feedback'
import { Input, Under } from '@/components/ui/form'
import { PageHeader } from '@/components/ui/page'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useAsync } from '@/hooks/useApi'
import { api, saveBlob } from '@/lib/api'
import { LIMITS as L } from '@/lib/limits'
import { numberError, rangeHint, textError } from '@/lib/validate'
import { useToast } from '@/lib/toast'
import { formatDate } from '@/lib/utils'
import type { Material } from '@/types'

const TEMPLATE = 'estimate_key,name,category,brand,grade,unit,unit_price,supplier,location\ncement,My OPC 53,Cement & Binders,BrandX,OPC 53,bag (50 kg),420,Local dealer,My city\n'

export default function Prices() {
  const { data, loading, error, reload } = useAsync(() => api.materials(), [])
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const importCsv = async (f: File | undefined) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) { toast.error('Choose a .csv file.'); return }
    setImporting(true)
    try {
      const r = await api.importPrices(f)
      if (r.errors.length) toast.error(`Imported ${r.created} row(s). ${r.errors.length} row(s) skipped, e.g. line ${r.errors[0].line}: ${r.errors[0].message}`)
      else toast.success(`Imported ${r.created} price record(s).`)
      await reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Import failed') } finally { setImporting(false) }
  }

  return (
    <>
      <PageHeader title="Material prices" description="Enter locally verified unit prices. Your prices override the built-in sample prices for your account only."
        actions={<>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = '' }} />
          <Button variant="outline" onClick={() => saveBlob(new Blob([TEMPLATE], { type: 'text/csv' }), 'buildwise_price_template.csv')}><Download className="h-4 w-4" /> CSV template</Button>
          <Button variant="accent" loading={importing} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV</Button>
        </>} />
      <Alert tone="warning" title="Sample prices are placeholders">Rows marked SAMPLE are demonstration values, not current market prices. Edit and save a row to store your own verified rate.</Alert>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <Card className="mt-4">
          <Table className="min-w-[60rem]">
            <THead><TR><TH>Material</TH><TH>Unit</TH><TH className="w-40">Unit price</TH><TH className="w-48">Supplier</TH><TH className="w-48">Location</TH><TH>Source</TH><TH>Updated</TH><TH /></TR></THead>
            <TBody>{data.map((m) => <PriceRow key={`${m.id}-${m.price_id}-${m.last_updated}`} m={m} onChanged={reload} />)}</TBody>
          </Table>
        </Card>
      )}
    </>
  )
}

function PriceRow({ m, onChanged }: { m: Material; onChanged: () => Promise<void> }) {
  const toast = useToast()
  const [price, setPrice] = useState(m.unit_price != null ? String(m.unit_price) : '')
  const [supplier, setSupplier] = useState(m.price_is_sample ? '' : m.supplier)
  const [location, setLocation] = useState(m.price_is_sample ? '' : m.location)
  const [busy, setBusy] = useState(false)
  const dirty = price !== (m.unit_price != null ? String(m.unit_price) : '') || supplier !== (m.price_is_sample ? '' : m.supplier) || location !== (m.price_is_sample ? '' : m.location)
  const own = !m.price_is_sample && m.price_id
  const errs = {
    price: numberError(price, 0, L.MAX_UNIT_PRICE),
    supplier: textError('title', supplier, { max: L.SUPPLIER }),
    location: textError('place', location, { max: L.PRICE_LOCATION }),
  }
  const hasErrors = Object.values(errs).some(Boolean)

  const save = async () => {
    if (hasErrors) return
    const v = Number(price)
    if (price.trim() === '' || !Number.isFinite(v) || v < 0 || v > L.MAX_UNIT_PRICE) { toast.error(`Unit price must be between 0 and ${L.MAX_UNIT_PRICE.toLocaleString('en-IN')}.`); return }
    setBusy(true)
    try {
      if (own) await api.updatePrice(m.price_id!, { unit_price: v, supplier, location })
      else await api.createPrice({ material_id: m.id, unit_price: v, supplier, location })
      toast.success(`Price for ${m.name} saved.`)
      await onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the price.') } finally { setBusy(false) }
  }
  const reset = async () => {
    setBusy(true)
    try { await api.deletePrice(m.price_id!); toast.success(m.editable ? 'Price removed.' : 'Reverted to the sample price.'); await onChanged() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove the price.') } finally { setBusy(false) }
  }
  return (
    <TR>
      <TD className="min-w-48 font-medium">{m.name}<div className="text-xs font-normal text-slate-500">{[m.brand, m.grade].filter(Boolean).join(' · ')}</div></TD>
      <TD>{m.unit}</TD>
      <TD><Input type="number" min={0} max={L.MAX_UNIT_PRICE} step="any" value={price} aria-label={`Unit price for ${m.name}`} onChange={(e) => setPrice(e.target.value)} className="h-8 min-w-28" invalid={!!errs.price} /><Under error={errs.price} hint={rangeHint(0, L.MAX_UNIT_PRICE)} /></TD>
      <TD><Input value={supplier} maxLength={L.SUPPLIER} onChange={(e) => setSupplier(e.target.value)} aria-label={`Supplier for ${m.name}`} placeholder={m.price_is_sample ? 'Your supplier' : ''} className="h-8" invalid={!!errs.supplier} /><Under error={errs.supplier} /></TD>
      <TD><Input value={location} maxLength={L.PRICE_LOCATION} onChange={(e) => setLocation(e.target.value)} aria-label={`Location for ${m.name}`} className="h-8" invalid={!!errs.location} /><Under error={errs.location} /></TD>
      <TD>{m.price_is_sample ? <Badge tone="amber">SAMPLE</Badge> : m.unit_price == null ? <Badge tone="red">No price</Badge> : <Badge tone="green">Your price</Badge>}</TD>
      <TD className="whitespace-nowrap">{formatDate(m.last_updated)}</TD>
      <TD className="whitespace-nowrap text-right">
        <Button size="sm" variant={dirty ? 'accent' : 'outline'} disabled={!dirty || hasErrors} loading={busy} onClick={save}><Save className="h-3.5 w-3.5" /> Save</Button>
        {own && <Button size="icon" variant="ghost" aria-label={`Reset price for ${m.name}`} title={m.editable ? 'Remove price' : 'Revert to sample price'} onClick={reset}><Undo2 className="h-4 w-4" /></Button>}
      </TD>
    </TR>
  )
}
