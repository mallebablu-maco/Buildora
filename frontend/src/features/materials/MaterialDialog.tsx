import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Alert } from '@/components/ui/feedback'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { api } from '@/lib/api'
import { LIMITS as L } from '@/lib/limits'
import { numberError, rangeHint, textError } from '@/lib/validate'
import { KEY_LABEL, PRICED_KEYS } from '@/lib/utils'
import type { Material } from '@/types'

const empty = { estimate_key: 'cement', name: '', category: '', brand: '', grade: '', specification: '', durability_notes: '', unit: '', unit_price: '', supplier: '', location: '' }

/** Create or edit a user-owned catalogue material. */
export function MaterialDialog({ open, onClose, material, onSaved, currency = 'INR' }: { open: boolean; onClose: () => void; material?: Material | null; onSaved: () => void; currency?: string }) {
  const [f, setF] = useState(empty)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setError(null)
    setF(material ? { ...empty, ...material, unit_price: '' } : empty)
  }, [open, material])
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  const errs = {
    name: textError('material', f.name, { max: L.MATERIAL_NAME, required: 'Enter a name.' }),
    category: textError('title', f.category, { max: L.CATEGORY, required: 'Enter a category.' }),
    unit: textError('unit', f.unit, { max: L.UNIT, required: 'Enter the unit.' }),
    brand: textError('material', f.brand, { max: L.BRAND }),
    grade: textError('grade', f.grade, { max: L.GRADE }),
    unit_price: material ? null : numberError(f.unit_price, 0, L.MAX_UNIT_PRICE, { optional: true }),
    supplier: material ? null : textError('title', f.supplier, { max: L.SUPPLIER }),
    location: material ? null : textError('place', f.location, { max: L.PRICE_LOCATION }),
    specification: f.specification.length > L.SPECIFICATION ? `Use at most ${L.SPECIFICATION} characters.` : null,
    durability_notes: f.durability_notes.length > L.NOTES ? `Use at most ${L.NOTES} characters.` : null,
  }
  const hasErrors = Object.values(errs).some(Boolean)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (hasErrors) return
    if (!f.name.trim() || !f.unit.trim() || !f.category.trim()) { setError('Name, category and unit are required.'); return }
    const price = f.unit_price.trim() === '' ? undefined : Number(f.unit_price)
    if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > L.MAX_UNIT_PRICE)) { setError(`Unit price must be between 0 and ${L.MAX_UNIT_PRICE.toLocaleString('en-IN')}.`); return }
    setBusy(true); setError(null)
    try {
      const base = { estimate_key: f.estimate_key, name: f.name.trim(), category: f.category.trim(), brand: f.brand, grade: f.grade, specification: f.specification, durability_notes: f.durability_notes, unit: f.unit.trim() }
      if (material) await api.updateMaterial(material.id, base)
      else await api.createMaterial({ ...base, unit_price: price, supplier: f.supplier, location: f.location, currency })
      onSaved(); onClose()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the material.') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title={material ? 'Edit material' : 'Add material'} description="Custom materials are private to your account.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Used for estimate line *"><Select value={f.estimate_key} onChange={set('estimate_key')}>{PRICED_KEYS.map((k) => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}</Select></Field>
          <Field label="Name *" error={errs.name} hint={`Up to ${L.MATERIAL_NAME} characters`}><Input value={f.name} onChange={set('name')} maxLength={L.MATERIAL_NAME} invalid={!!errs.name} /></Field>
          <Field label="Category *" error={errs.category} hint={`Up to ${L.CATEGORY} characters`}><Input value={f.category} onChange={set('category')} maxLength={L.CATEGORY} invalid={!!errs.category} /></Field>
          <Field label="Unit *" error={errs.unit} hint="Must match the estimate unit, e.g. bag (50 kg), kg, m³, nos, litre"><Input value={f.unit} onChange={set('unit')} maxLength={L.UNIT} invalid={!!errs.unit} /></Field>
          <Field label="Brand" error={errs.brand} hint={`Up to ${L.BRAND} characters`}><Input value={f.brand} onChange={set('brand')} maxLength={L.BRAND} invalid={!!errs.brand} /></Field>
          <Field label="Grade / specification" error={errs.grade} hint={`Up to ${L.GRADE} characters`}><Input value={f.grade} onChange={set('grade')} maxLength={L.GRADE} invalid={!!errs.grade} /></Field>
          {!material && <>
            <Field label={`Unit price (${currency})`} error={errs.unit_price} hint={`Optional, ${rangeHint(0, L.MAX_UNIT_PRICE)}`}><Input type="number" min={0} max={L.MAX_UNIT_PRICE} step="any" value={f.unit_price} onChange={set('unit_price')} invalid={!!errs.unit_price} /></Field>
            <Field label="Supplier" error={errs.supplier} hint={`Up to ${L.SUPPLIER} characters`}><Input value={f.supplier} onChange={set('supplier')} maxLength={L.SUPPLIER} invalid={!!errs.supplier} /></Field>
            <Field label="Location" error={errs.location} hint={`Up to ${L.PRICE_LOCATION} characters`}><Input value={f.location} onChange={set('location')} maxLength={L.PRICE_LOCATION} invalid={!!errs.location} /></Field>
          </>}
        </div>
        <Field label="Specification notes" error={errs.specification} hint={`Up to ${L.SPECIFICATION} characters`}><Textarea value={f.specification} onChange={set('specification')} maxLength={L.SPECIFICATION} /></Field>
        <Field label="Durability notes" error={errs.durability_notes} hint={`Only enter information you can verify. Up to ${L.NOTES} characters.`}><Textarea value={f.durability_notes} onChange={set('durability_notes')} maxLength={L.NOTES} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" variant="accent" loading={busy} disabled={hasErrors}>{material ? 'Save changes' : 'Add material'}</Button></div>
      </form>
    </Dialog>
  )
}
