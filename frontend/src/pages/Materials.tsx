import { RotateCw, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Alert, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui/feedback'
import { Input, Select, Under } from '@/components/ui/form'
import { MoneyInput } from '@/components/ui/money'
import { PageHeader } from '@/components/ui/page'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ComparePanel } from '@/features/materials/ComparePanel'
import { useAsync } from '@/hooks/useApi'
import { api } from '@/lib/api'
import { LIMITS as L } from '@/lib/limits'
import { useToast } from '@/lib/toast'
import { formatDate, formatMoney, KEY_LABEL, PRICED_KEYS } from '@/lib/utils'
import { numberError, textError } from '@/lib/validate'
import type { Material } from '@/types'

/**
 * One page for materials and prices. The Buildora team keeps the market prices (admin website); anyone may set their OWN
 * price for a material, e.g. their dealer's rate, which is used only in their own estimates.
 */
export default function MaterialsPage() {
  const toast = useToast()
  const mats = useAsync(() => api.materials(), [])
  const projects = useAsync(() => api.projects(), [])
  const [q, setQ] = useState('')
  const [key, setKey] = useState('all')
  const [del, setDel] = useState<Material | null>(null)

  const list = (mats.data ?? []).filter((m) => (key === 'all' || m.estimate_key === key)
    && `${m.name} ${m.brand} ${m.grade} ${m.category}`.toLowerCase().includes(q.trim().toLowerCase()))
  const samples = (mats.data ?? []).some((m) => m.market_price_is_sample && m.price_source !== 'own')

  return (
    <>
      <PageHeader title="Materials & Prices" description="Market prices are kept up to date by the Buildora team. Got a better rate from your dealer? Enter it as “My price”: it is used only in your own estimates." />
      {samples && <Alert tone="warning" title="Some prices are placeholders">Prices marked SAMPLE are not market rates yet. Enter your own price, or check back later.</Alert>}
      <div className="my-4 flex flex-wrap gap-2">
        <Input placeholder="Search materials, brands…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Search materials" />
        <Select value={key} onChange={(e) => setKey(e.target.value)} className="w-48" aria-label="Filter by material type"><option value="all">All material types</option>{PRICED_KEYS.map((k) => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}</Select>
      </div>
      {mats.loading && <Spinner />}
      {mats.error && <ErrorState message={mats.error} onRetry={mats.reload} />}
      {mats.data && (list.length === 0 ? <EmptyState title="No materials match" description="Change the search or the type filter." /> : (
        <Card className="mb-8"><Table className="min-w-[64rem]">
          <THead><TR><TH className="w-64">Material</TH><TH>Type</TH><TH>Unit</TH><TH className="text-right">Market price</TH><TH className="w-40">My price</TH><TH className="w-44">My supplier</TH><TH>Used in your estimates</TH><TH /></TR></THead>
          <TBody>{list.map((m) => <Row key={`${m.id}-${m.price_id}-${m.last_updated}`} m={m} onChanged={mats.reload} onDelete={() => setDel(m)} />)}</TBody>
        </Table></Card>
      ))}
      {mats.data && projects.data && <ComparePanel materials={mats.data} projects={projects.data} />}
      <ConfirmDialog open={!!del} title="Delete your material?" message={`“${del?.name}” and your price for it will be permanently deleted.`}
        onCancel={() => setDel(null)}
        onConfirm={async () => { try { await api.deleteMaterial(del!.id); toast.success('Material deleted.'); await mats.reload() } catch (e) { toast.error(e instanceof Error ? e.message : 'Delete failed') } setDel(null) }} />
    </>
  )
}

function Row({ m, onChanged, onDelete }: { m: Material; onChanged: () => Promise<void>; onDelete: () => void }) {
  const toast = useToast()
  // whose price is in use: the user's own, the team's market price, or a placeholder sample (older APIs: guess from is_sample)
  const source = m.price_source ?? (m.price_is_sample ? 'sample' : m.unit_price == null ? 'none' : 'own')
  const mine = source === 'own'
  const startPrice = mine && m.unit_price != null ? String(m.unit_price) : ''
  const startSupplier = mine ? m.supplier : ''
  const [price, setPrice] = useState(startPrice)
  const [supplier, setSupplier] = useState(startSupplier)
  const [busy, setBusy] = useState(false)
  const errs = { price: price === '' ? null : numberError(price, 0, L.MAX_UNIT_PRICE), supplier: textError('title', supplier, { max: L.SUPPLIER }) }
  const dirty = price !== startPrice || supplier !== startSupplier
  const canSave = dirty && price !== '' && !errs.price && !errs.supplier
  const market = m.market_price ?? (source === 'market' || source === 'sample' ? m.unit_price : null)

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      if (mine && m.price_id) await api.updatePrice(m.price_id, { unit_price: Number(price), supplier: supplier.trim(), location: m.location })
      else await api.createPrice({ material_id: m.id, unit_price: Number(price), supplier: supplier.trim() })
      toast.success(`Your price for ${m.name} is saved.`)
      await onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save your price.') } finally { setBusy(false) }
  }
  const backToMarket = async () => {
    setBusy(true)
    try { await api.deletePrice(m.price_id!); toast.success(m.editable ? 'Your price is removed.' : 'Back to the market price.'); await onChanged() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove your price.') } finally { setBusy(false) }
  }
  return (
    <TR>
      <TD className="break-words font-medium">{m.name}{m.editable && <Badge tone="navy" className="ml-2">Your material</Badge>}
        <div className="text-xs font-normal text-slate-500">{[m.brand, m.grade].filter(Boolean).join(' · ')}</div></TD>
      <TD className="whitespace-nowrap">{KEY_LABEL[m.estimate_key] ?? m.estimate_key}</TD>
      <TD className="whitespace-nowrap">{m.unit}</TD>
      <TD className="whitespace-nowrap text-right tabular-nums">
        {market != null ? formatMoney(market, m.currency ?? 'INR', 2) : '—'}
        {market != null && (m.market_price_is_sample ?? source === 'sample') && <Badge tone="amber" className="ml-1">SAMPLE</Badge>}
        {m.market_updated_at && !m.market_price_is_sample && <div className="text-xs text-slate-500">updated {formatDate(m.market_updated_at)}</div>}
      </TD>
      <TD className="group">
        <MoneyInput value={price} onValueChange={setPrice} placeholder={market != null ? 'Use market price' : 'Enter a price'} aria-label={`My price for ${m.name}`} className="h-8" invalid={!!errs.price} />
        <Under error={errs.price} hint="0 to 10,00,000" />
      </TD>
      <TD><Input value={supplier} maxLength={L.SUPPLIER} onChange={(e) => setSupplier(e.target.value)} aria-label={`My supplier for ${m.name}`} placeholder="Optional" className="h-8" invalid={!!errs.supplier} /><Under error={errs.supplier} /></TD>
      <TD className="whitespace-nowrap">{source === 'own' ? <Badge tone="green">My price</Badge> : source === 'market' ? <Badge tone="navy">Market price</Badge> : source === 'sample' ? <Badge tone="amber">SAMPLE</Badge> : <Badge tone="red">No price</Badge>}</TD>
      <TD className="whitespace-nowrap text-right">
        <Button size="sm" variant={canSave ? 'accent' : 'outline'} disabled={!canSave} loading={busy} onClick={save}><Save className="h-3.5 w-3.5" /> Save</Button>
        {mine && m.price_id && <Button size="icon" variant="ghost" aria-label={`Use the market price for ${m.name}`} title="Go back to the market price" onClick={backToMarket}><RotateCw className="h-4 w-4" /></Button>}
        {m.editable && <Button size="icon" variant="ghost" aria-label={`Delete ${m.name}`} onClick={onDelete}><Trash2 className="h-4 w-4 text-red-500" /></Button>}
      </TD>
    </TR>
  )
}
