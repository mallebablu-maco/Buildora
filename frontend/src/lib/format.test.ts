import { describe, expect, it } from 'vitest'
import { errorMessage } from './api'
import { formatArea, formatLength, formatMoney, formatUpdated } from './format'

describe('formatting', () => {
  it('uses Indian digit grouping', () => {
    expect(formatArea(216)).toBe('216 m²')
    expect(formatArea(123456.5)).toBe('1,23,456.5 m²')
    expect(formatLength(3.5)).toBe('3.5 m')
    expect(formatMoney(1764600)).toBe('₹17,64,600')
  })
  it('falls back for an unknown currency code', () => {
    expect(formatMoney(5, 'XX')).toContain('5')
  })
  it('shows time for today and the date for earlier days', () => {
    const now = new Date('2026-10-26T12:00:00')
    expect(formatUpdated('2026-10-26T10:42:00', now)).toBe('Today, 10:42')
    expect(formatUpdated('2026-10-07T09:00:00', now)).toBe('07 Oct 2026')
    expect(formatUpdated('nonsense', now)).toBe('—')
  })
})

describe('errorMessage', () => {
  it('uses a plain message as is', () => expect(errorMessage(404, { detail: 'Project not found.' })).toBe('Project not found.'))
  it('summarises validation problems', () => {
    const msg = errorMessage(422, { detail: [{ loc: ['body', 'length'], msg: 'Input should be greater than 0' }, { loc: ['body', 'rooms', 0, 'name'], msg: 'Field required' }] })
    expect(msg).toBe('Please check the form: length: Input should be greater than 0; rooms › 0 › name: Field required')
  })
  it('falls back to the status', () => {
    expect(errorMessage(500, null)).toBe('Request failed (500).')
    expect(errorMessage(502, { detail: [] })).toBe('Request failed (502).')
  })
})
