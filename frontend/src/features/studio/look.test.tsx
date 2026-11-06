import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOOK, floorFinishFor, isDefaultLook, lookSettings, readLook } from './look'
import { LookPanel } from './LookPanel'
import { PALETTE } from './materials'

describe('look settings', () => {
  it('defaults to the original colours when nothing is saved', () => {
    expect(readLook(undefined)).toEqual(DEFAULT_LOOK)
    expect(readLook({ autoFurnish: true })).toEqual(DEFAULT_LOOK)
    expect(DEFAULT_LOOK.wallIn).toBe(PALETTE.wall)
    expect(DEFAULT_LOOK.roof).toBe(PALETTE.roof)
    expect(isDefaultLook(readLook({}))).toBe(true)
  })
  it('round-trips through the saved settings', () => {
    const l = { wallOut: '#c8794f', wallIn: '#f4ead2', exterior: 'brick' as const, floor: 'marble' as const, roof: '#a4472f', roofStyle: 'hip' as const, sunshades: true, entrance: false, garden: true }
    expect(readLook(lookSettings(l))).toEqual(l)
    expect(isDefaultLook(l)).toBe(false)
  })
  it('ignores anything invalid (bad colours, unknown finishes, scripts)', () => {
    const l = readLook({ lookWallOut: 'red', lookWallIn: '#12345', lookExterior: 'gold', lookFloor: '<script>', lookRoof: 42, lookRoofStyle: 'dome', lookSunshades: 'yes', lookGarden: 1 })
    expect(l).toEqual(DEFAULT_LOOK)
  })
  it('chosen floor finish applies to dry rooms; wet rooms keep their tiles', () => {
    expect(floorFinishFor('bedroom', 'wood', 'auto')).toBe('wood')
    expect(floorFinishFor('bedroom', 'wood', 'marble')).toBe('marble')
    expect(floorFinishFor('corridor', 'concrete', 'granite')).toBe('granite')
    for (const wet of ['bathroom', 'kitchen', 'balcony']) expect(floorFinishFor(wet, 'tile', 'marble')).toBe('tile')
  })
})

describe('Colours & finishes panel', () => {
  it('changes the outside finish, colours and floors, and offers a way back to the default', () => {
    const onChange = vi.fn()
    const { rerender } = render(<LookPanel look={DEFAULT_LOOK} onChange={onChange} />)
    expect(screen.queryByText(/Default look/)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Brick' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, exterior: 'brick' })
    fireEvent.click(screen.getAllByRole('radio', { name: 'Terracotta' })[0])
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, wallOut: '#c8794f' })
    fireEvent.change(screen.getByLabelText('Floors'), { target: { value: 'marble' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, floor: 'marble' })
    rerender(<LookPanel look={{ ...DEFAULT_LOOK, floor: 'marble' }} onChange={onChange} />)
    expect(screen.getByText(/keep their tiles/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Hip' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, floor: 'marble', roofStyle: 'hip' })
    fireEvent.click(screen.getByRole('switch', { name: /Sunshades/ }))
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_LOOK, floor: 'marble', sunshades: true })
    fireEvent.click(screen.getByText(/Default look/))
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_LOOK)
  })
})
