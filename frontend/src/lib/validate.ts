import { LIMITS, TEXT_KINDS, type TextKind } from './limits'

const isLetter = (ch: string) => /\p{L}/u.test(ch)
const isDigit = (ch: string) => /\p{Nd}/u.test(ch)

/** null when the text is fine, otherwise the message to show under the box. Empty text is fine here: "required" is checked separately. */
export function textError(kind: TextKind, value: string, { max, required = false }: { max?: number; required?: boolean | string } = {}): string | null {
  const v = value.trim()
  if (v === '') return required ? (typeof required === 'string' ? required : 'This is required.') : null
  if (max !== undefined && v.length > max) return `Use at most ${max} characters.`
  const { extra, digits, help } = TEXT_KINDS[kind]
  for (const ch of v) if (!(isLetter(ch) || ch === ' ' || extra.includes(ch) || (digits && isDigit(ch)))) return `Use ${help}.`
  if (![...v].some(isLetter)) return 'Include at least one letter.'
  return null
}

/** null when `value` (what was typed) is a number inside the range, otherwise the message for under the box. */
export function numberError(value: string | number, min: number, max: number, { whole = false, optional = false, unit = '' }: { whole?: boolean; optional?: boolean; unit?: string } = {}): string | null {
  const text = String(value).trim()
  if (text === '') return optional ? null : 'Enter a number.'
  const n = Number(text)
  if (!Number.isFinite(n)) return 'Enter a number.'
  if (whole && !Number.isInteger(n)) return 'Enter a whole number.'
  const u = unit ? ` ${unit}` : ''
  if (n < min || n > max) return `Must be between ${fmt(min)} and ${fmt(max)}${u}.`
  return null
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })

/** "1 to 200 m" style hint shown under a number box before anything is typed. */
export const rangeHint = (min: number, max: number, unit = '') => `${fmt(min)} to ${fmt(max)}${unit ? ` ${unit}` : ''}`

export { LIMITS }
