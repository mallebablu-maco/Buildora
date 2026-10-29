import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/features/auth/auth-context'
import { authValue, fakeSession } from '@/features/auth/test-utils'
import { ApiError } from '@/lib/api'
import { ToastProvider } from '@/lib/toast'
import AdminApp from './AdminApp'
import { adminApi, type AdminMaterial } from './adminApi'

vi.mock('./adminApi', () => ({
  adminApi: { me: vi.fn(), overview: vi.fn(), users: vi.fn(), materials: vi.fn(), createMaterial: vi.fn(), updateMaterial: vi.fn(), setPrice: vi.fn(), setHidden: vi.fn(), importPrices: vi.fn() },
}))
const a = vi.mocked(adminApi)

const cement: AdminMaterial = {
  id: 'm1', estimate_key: 'cement', name: 'Ordinary Portland Cement 43', category: 'Cement & Binders', brand: 'Generic (sample)', grade: 'OPC 43',
  specification: '', durability_notes: '', unit: 'bag (50 kg)', is_hidden: false, market_price: 400, currency: 'INR', supplier: '', location: '',
  price_is_sample: true, price_updated_at: '2026-10-27T10:00:00Z',
}

function show(route: string, value = authValue({ session: fakeSession, user: fakeSession.user })) {
  render(<AuthContext.Provider value={value}><ToastProvider><MemoryRouter initialEntries={[route]}><AdminApp /></MemoryRouter></ToastProvider></AuthContext.Provider>)
  return userEvent.setup()
}

beforeEach(() => {
  vi.resetAllMocks()
  a.me.mockResolvedValue({ id: 'u1', email: 'owner@example.com', full_name: 'Owner', is_admin: true })
  a.overview.mockResolvedValue({ users_total: 12, homeowners: 7, contractors: 4, no_role: 1, new_7d: 3, new_30d: 9, active_7d: 5, active_30d: 10,
    by_provider: { email: 8, google: 4 }, projects: 20, estimates: 18, reports: 6, signups_per_day: [{ day: '2026-10-29', count: 3 }] })
  a.users.mockResolvedValue([
    { id: '1', email: 'asha@example.com', full_name: 'Asha', persona: 'homeowner', providers: ['email'], created_at: '2026-10-20T00:00:00Z', last_sign_in_at: '2026-10-29T00:00:00Z', email_confirmed: true, is_admin: false, projects: 2 },
    { id: '2', email: 'ravi@example.com', full_name: 'Ravi', persona: 'contractor', providers: ['google'], created_at: '2026-10-21T00:00:00Z', last_sign_in_at: null, email_confirmed: true, is_admin: false, projects: 5 },
  ])
  a.materials.mockResolvedValue([cement])
})

describe('Admin website: who gets in', () => {
  it('asks a logged-out visitor to log in, with no sign-up option', () => {
    show('/', authValue())
    expect(screen.getByRole('heading', { name: 'Buildora Admin' })).toBeInTheDocument()
    expect(screen.queryByText(/create an account/i)).not.toBeInTheDocument()
  })
  it('shows "Not allowed" to a logged-in user who is not an Admin', async () => {
    a.me.mockRejectedValue(new ApiError(403, 'Admins only.'))
    show('/')
    expect(await screen.findByText('This account is not an Admin')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument()
    expect(a.overview).not.toHaveBeenCalled()
  })
  it('lets an Admin in and shows the overview', async () => {
    show('/')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('7 homeowners · 4 contractors')).toBeInTheDocument()
    expect(screen.getByText('18 estimates · 6 reports')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument()
  })
})

describe('Admin website: pages', () => {
  it('Users: lists everyone and filters by role and search', async () => {
    const user = show('/users')
    const table = await screen.findByRole('table')  // (the sidebar also shows the logged-in admin's own email)
    expect(within(table).getByText('asha@example.com')).toBeInTheDocument()
    expect(within(table).getByText('ravi@example.com')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filter by role'), 'contractor')
    expect(within(screen.getByRole('table')).queryByText('asha@example.com')).not.toBeInTheDocument()
    expect(screen.getByText('Never')).toBeInTheDocument()  // Ravi has not logged in yet
    await user.selectOptions(screen.getByLabelText('Filter by role'), 'all')
    await user.type(screen.getByLabelText('Search users'), 'asha')
    expect(within(screen.getByRole('table')).queryByText('ravi@example.com')).not.toBeInTheDocument()
  })
  it('Materials: saving a market price sends the plain number', async () => {
    a.setPrice.mockResolvedValue({ ...cement, market_price: 455, price_is_sample: false })
    const user = show('/materials')
    const box = await screen.findByLabelText('Market price for Ordinary Portland Cement 43')
    expect(box).toHaveValue('400')
    await user.clear(box)
    await user.type(box, '45500')
    expect(box).toHaveValue('45,500')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(a.setPrice).toHaveBeenCalledWith('m1', { unit_price: 45500, supplier: '', location: '' }))
  })
  it('Materials: hiding asks first', async () => {
    a.setHidden.mockResolvedValue({ ...cement, is_hidden: true })
    const user = show('/materials')
    await user.click(await screen.findByRole('button', { name: 'Hide Ordinary Portland Cement 43' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Hide this material?' })
    await user.click(within(dialog).getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(a.setHidden).toHaveBeenCalledWith('m1', true))
  })
  it('Materials: adding a material checks the boxes before sending', async () => {
    a.createMaterial.mockResolvedValue({ ...cement, id: 'm2', name: 'UltraTech OPC 53' })
    const user = show('/materials')
    await user.click(await screen.findByRole('button', { name: 'Add material' }))
    const add = screen.getAllByRole('button', { name: 'Add material' }).at(-1)!
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('Name *'), 'UltraTech OPC 53')
    await user.type(screen.getByLabelText('Category *'), 'Cement & Binders')
    await user.type(screen.getByLabelText(/^Unit \*/), 'bag (50 kg)')
    await user.type(screen.getByLabelText('Market price (₹) *'), '470')
    await user.click(add)
    await waitFor(() => expect(a.createMaterial).toHaveBeenCalledWith(expect.objectContaining({ name: 'UltraTech OPC 53', estimate_key: 'cement', unit_price: 470 })))
  })
})
