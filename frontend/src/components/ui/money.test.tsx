import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { cleanAmount, groupIndian, MoneyInput } from './money'

describe('Indian money formatting', () => {
  it.each([['0', '0'], ['999', '999'], ['1000', '1,000'], ['100000', '1,00,000'], ['2000000', '20,00,000'], ['10000000000', '10,00,00,00,000'], ['12345.5', '12,345.5']])(
    '%s -> %s', (raw, shown) => expect(groupIndian(raw)).toBe(shown))
  it('cleans what is typed or pasted', () => {
    expect(cleanAmount('20,00,000')).toBe('2000000')
    expect(cleanAmount('₹ 1,50,000.756')).toBe('150000.75')
    expect(cleanAmount('007')).toBe('7')
    expect(cleanAmount('1.2.3')).toBe('1.23')
  })
})

function Box() {
  const [v, setV] = useState('')
  return <><MoneyInput aria-label="Budget" value={v} onValueChange={setV} /><output>{v}</output></>
}

describe('MoneyInput', () => {
  it('adds Indian commas while typing and keeps the plain number', async () => {
    const user = userEvent.setup()
    render(<Box />)
    await user.type(screen.getByLabelText('Budget'), '2000000')
    expect(screen.getByLabelText('Budget')).toHaveValue('20,00,000')
    expect(screen.getByRole('status')).toHaveTextContent('2000000')
  })
  it('ignores letters and a second decimal point', async () => {
    const user = userEvent.setup()
    render(<Box />)
    await user.type(screen.getByLabelText('Budget'), '15e0a0.5.0')
    expect(screen.getByLabelText('Budget')).toHaveValue('1,500.50')
  })
  it('accepts a pasted amount with commas', async () => {
    const user = userEvent.setup()
    render(<Box />)
    screen.getByLabelText('Budget').focus()
    await user.paste('25,00,000')
    expect(screen.getByRole('status')).toHaveTextContent('2500000')
    expect(screen.getByLabelText('Budget')).toHaveValue('25,00,000')
  })
})
