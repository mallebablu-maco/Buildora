import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Input } from './form'
import { Input as FieldInput } from './field'

function Box({ min, kind }: { min?: number; kind: 'form' | 'field' }) {
  const [v, setV] = useState('')
  const C = kind === 'form' ? Input : FieldInput
  return <C aria-label="amount" type="number" min={min} value={v} onChange={(e) => setV(e.target.value)} />
}

describe('number boxes take digits and one decimal point only', () => {
  it.each(['form', 'field'] as const)('%s input ignores e, E, +, - and letters', async (kind) => {
    const user = userEvent.setup()
    render(<Box kind={kind} min={0} />)
    const box = screen.getByLabelText('amount') as HTMLInputElement
    await user.type(box, 'e1E2+3-4abc.5.6')
    expect(box.value).toBe('1234.56')
  })
  it('allows a minus sign only where the minimum is negative', async () => {
    const user = userEvent.setup()
    render(<Box kind="form" min={-10} />)
    await user.type(screen.getByLabelText('amount'), '-5')
    expect((screen.getByLabelText('amount') as HTMLInputElement).value).toBe('-5')
  })
  it('refuses pasting text that is not a number', async () => {
    const user = userEvent.setup()
    render(<Box kind="form" min={0} />)
    const box = screen.getByLabelText('amount') as HTMLInputElement
    box.focus()
    await user.paste('12e5')
    expect(box.value).toBe('')
    await user.paste('42.5')
    expect(box.value).toBe('42.5')
  })
})
