import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { Input } from './field'

/** Keep digits and one decimal point (at most 2 decimals); drop leading zeros. "20,00,000.5" -> "2000000.5". */
export function cleanAmount(text: string): string {
  let s = text.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  return s.replace(/^0+(?=\d)/, '')
}

/** Indian digit grouping, as typed: "2000000" -> "20,00,000", "12345.5" -> "12,345.5". */
export function groupIndian(raw: string): string {
  const [int, dec] = raw.split('.')
  const last3 = int.slice(-3)
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return (rest ? `${rest},${last3}` : last3) + (dec !== undefined ? `.${dec}` : '')
}

const same = (a: string, b: string) => (a === '' && b === '') || (a !== '' && b !== '' && Number(a) === Number(b))

/**
 * A money box that shows Indian commas while typing (20,00,000) but hands back the plain number text ("2000000").
 * Only digits and one decimal point can be typed; pasted amounts with commas are accepted.
 */
export function MoneyInput({ value, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string
  onValueChange: (raw: string) => void
}) {
  const [text, setText] = useState(() => groupIndian(cleanAmount(value)))
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)

  useEffect(() => { // the value was changed from outside (form reset, saved project loaded)
    if (!same(cleanAmount(text), value)) setText(groupIndian(cleanAmount(value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => { // keep the cursor where the person was typing after commas are added or removed
    if (caret.current !== null && ref.current) ref.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [text])

  return (
    <Input {...props} ref={ref} type="text" inputMode="decimal" autoComplete="off" value={text}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1) return // shortcuts, arrows, Backspace, Tab…
        if (!/[\d.]/.test(e.key) || (e.key === '.' && text.includes('.'))) e.preventDefault()
      }}
      onChange={(e) => {
        const typed = e.target.value
        const pos = e.target.selectionStart ?? typed.length
        const keep = typed.slice(0, pos).replace(/[^\d.]/g, '').length // digits before the cursor
        const raw = cleanAmount(typed)
        const shown = groupIndian(raw)
        let at = 0, seen = 0
        while (at < shown.length && seen < keep) { if (/[\d.]/.test(shown[at])) seen++; at++ }
        caret.current = at
        setText(shown)
        onValueChange(raw)
      }} />
  )
}
