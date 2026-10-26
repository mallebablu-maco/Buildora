const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/** 1234.5 -> "1,234.5 m²" (Indian digit grouping, as in the design). */
export const formatArea = (m2: number) => `${number.format(m2)} m²`
export const formatLength = (m: number) => `${number.format(m)} m`

export function formatMoney(amount: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${number.format(amount)}`
  }
}

/** Today -> "Today, 10:42"; otherwise "07 Oct 2026". */
export function formatUpdated(iso: string, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  if (d.toDateString() === now.toDateString()) return `Today, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
