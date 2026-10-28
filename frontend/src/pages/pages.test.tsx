/**
 * Every screen, rendered with the API's REAL responses (src/test/fixtures/api_responses.json, captured by the backend tests).
 * The 3D canvas needs WebGL, which the test environment does not have, so only the canvas itself is replaced by a stand-in:
 * all the panels around it, and the geometry behind it, run for real.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/lib/api'
import { formatMoney } from '@/lib/utils'
import F from '@/test/fixtures/api_responses.json'
import { renderApp } from '@/test/render'
import Catalogue from './Catalogue'
import CostAnalysis from './CostAnalysis'
import Dashboard from './Dashboard'
import Estimation from './Estimation'
import Optimization from './Optimization'
import Prices from './Prices'
import Reports from './Reports'
import SettingsPage from './Settings'
import Studio from './Studio'

vi.mock('@/lib/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/api')>()
  return { ...real, api: Object.fromEntries(Object.keys(real.api).map((k) => [k, vi.fn()])) as unknown as typeof real.api }
})
vi.mock('@/features/studio/BuildingViewer', () => ({ BuildingViewer: () => <div data-testid="viewer-3d" /> }))

const a = vi.mocked(api)
const pid = F.project.id
const at = (path: string, ui: ReactNode, route: string) => renderApp(<Routes><Route path={path} element={ui} /></Routes>, route)

beforeEach(() => {
  vi.resetAllMocks()
  a.dashboard.mockResolvedValue(F.dashboard as never)
  a.projects.mockResolvedValue(F.projects as never)
  a.project.mockResolvedValue(F.project as never)
  a.getEstimate.mockResolvedValue(F.estimate as never)
  a.runEstimate.mockResolvedValue(F.estimate as never)
  a.recommendations.mockResolvedValue(F.recommendations as never)
  a.materials.mockResolvedValue(F.materials as never)
  a.reports.mockResolvedValue(F.reports as never)
  a.profile.mockResolvedValue(F.profile as never)
  a.updateProfile.mockResolvedValue(F.profile as never)
  a.floorplanBlob.mockResolvedValue(new Blob(['x']))
  a.saveLayout.mockResolvedValue(F.project as never)
  a.resetLayout.mockResolvedValue(F.project as never)
  a.updateConfig.mockResolvedValue(F.project as never)
  a.createReport.mockResolvedValue(F.reports[0] as never)
  a.reportBlob.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
})

describe('Dashboard', () => {
  it('greets the user and summarises the real data', async () => {
    at('/dashboard', <Dashboard />, '/dashboard')
    expect(await screen.findByText('Welcome, Asha')).toBeInTheDocument()
    expect(screen.getByText('Total projects')).toBeInTheDocument()
    expect(screen.getByText('Demo data present')).toBeInTheDocument()
    expect(screen.getAllByText(F.dashboard.recent_projects[0].name).length).toBeGreaterThan(0)
    expect(screen.getByText(F.dashboard.recent_reports[0].file_name)).toBeInTheDocument()
    expect(screen.getAllByText(formatMoney(F.dashboard.total_estimated_cost, 'INR')).length).toBeGreaterThan(0)
  })
  it('offers the demo project to a user with nothing yet', async () => {
    a.dashboard.mockResolvedValue({ ...F.dashboard, total_projects: 0, saved_estimates: 0, total_estimated_cost: 0, avg_cost_per_sqft: null, has_demo_data: false, recent_projects: [], recent_reports: [], cost_distribution: [], material_quantities: [] } as never)
    at('/dashboard', <Dashboard />, '/dashboard')
    expect(await screen.findByText('Start your first project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load demo project' })).toBeInTheDocument()
  })
  it('explains a failure and can retry', async () => {
    a.dashboard.mockRejectedValueOnce(new Error('The database is unavailable. Please try again shortly.')).mockResolvedValueOnce(F.dashboard as never)
    const user = userEvent.setup()
    at('/dashboard', <Dashboard />, '/dashboard')
    expect(await screen.findByText('The database is unavailable. Please try again shortly.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Welcome, Asha')).toBeInTheDocument()
  })
})

describe('Material Estimation', () => {
  it('shows the quantities, formulas and totals from the real estimate', async () => {
    at('/estimation/:projectId?', <Estimation />, `/estimation/${pid}`)
    expect(await screen.findByText('Quantities')).toBeInTheDocument()
    for (const item of F.estimate.items.filter((i) => i.counts_toward_cost).slice(0, 4)) expect(screen.getAllByText(item.name).length).toBeGreaterThan(0)
    expect(screen.getAllByText(formatMoney(F.estimate.summary.material_total, 'INR')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/preliminary/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/saved 3D layout|estimated from room door\/window counts/)).toBeInTheDocument()  // says where the door/window sizes came from
  })
  it('asks the server for a what-if estimate when the wastage is changed, without saving it', async () => {
    a.runEstimate.mockResolvedValue(F.what_if_estimate as never)
    const user = userEvent.setup()
    at('/estimation/:projectId?', <Estimation />, `/estimation/${pid}`)
    const tiles = (await screen.findAllByLabelText(/wastage/i))[0]
    await user.clear(tiles)
    await user.type(tiles, '12')
    await waitFor(() => expect(a.runEstimate).toHaveBeenCalled())
    expect(JSON.stringify(a.runEstimate.mock.calls.at(-1))).toContain(pid)
  })
})

describe('Cost Analysis', () => {
  it('shows budget, categories, extras and alternatives', async () => {
    at('/cost-analysis/:projectId?', <CostAnalysis />, `/cost-analysis/${pid}`)
    expect(await screen.findByText('Budget')).toBeInTheDocument()
    expect(screen.getByText('Optional additional costs')).toBeInTheDocument()
    expect(screen.getByText('Material-wise cost')).toBeInTheDocument()
    expect(screen.getByText('Alternative material scenario')).toBeInTheDocument()
    expect(screen.getAllByText(formatMoney(F.estimate.summary.material_total, 'INR')).length).toBeGreaterThan(0)
  })
})

describe('Waste Optimization', () => {
  it('lists every recommendation the server produced', async () => {
    at('/optimization/:projectId?', <Optimization />, `/optimization/${pid}`)
    expect(await screen.findByText(F.recommendations[0].title)).toBeInTheDocument()
    for (const r of F.recommendations) expect(screen.getAllByText(r.title).length).toBeGreaterThan(0)
    expect(screen.getByText('Planned purchase quantities (optional)')).toBeInTheDocument()
  })
})

describe('Reports', () => {
  it('lists reports and generates a new one', async () => {
    const user = userEvent.setup()
    at('/reports', <Reports />, '/reports')
    expect(await screen.findByText('Report history')).toBeInTheDocument()
    expect(screen.getByText(F.reports[0].file_name)).toBeInTheDocument()
    expect(screen.getAllByText('Not downloaded yet').length).toBeGreaterThan(0)  // every row says something, even before a download
    await user.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => expect(a.createReport).toHaveBeenCalledWith(pid))
    expect(await screen.findByText('Successfully downloaded')).toBeInTheDocument()
  })
  it('history has Preview (no Download button), and the preview shows the PDF with a Download button', async () => {
    const user = userEvent.setup()
    at('/reports', <Reports />, '/reports')
    await screen.findByText(F.reports[0].file_name)
    expect(screen.queryByRole('button', { name: /^download$/i })).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /preview/i })[0])
    expect(await screen.findByTitle(`Preview of ${F.reports[0].file_name}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^download$/i }))
    expect(await screen.findByText('Successfully downloaded')).toBeInTheDocument()
  })
  it('says "Failed to download" when the PDF cannot be fetched', async () => {
    const user = userEvent.setup()
    a.reportBlob.mockRejectedValue(new Error('network down'))
    at('/reports', <Reports />, '/reports')
    await user.click(await screen.findByRole('button', { name: /generate/i }))
    expect(await screen.findByText('Failed to download')).toBeInTheDocument()
  })
})

describe('Material Prices and Catalogue', () => {
  it('prices page shows the user’s own material with its price', async () => {
    at('/prices', <Prices />, '/prices')
    expect(await screen.findByText('Material prices')).toBeInTheDocument()
    expect(screen.getAllByText('My local cement').length).toBeGreaterThan(0)
    expect(screen.getByText('Sample prices are placeholders')).toBeInTheDocument()
  })
  it('catalogue lists the shared samples and the user’s own materials, with the samples labelled', async () => {
    at('/catalogue', <Catalogue />, '/catalogue')
    expect(await screen.findByText('Material catalogue')).toBeInTheDocument()
    expect(screen.getAllByText('My local cement').length).toBeGreaterThan(0)
    expect(screen.getAllByText(F.materials.find((m) => m.is_sample)!.name).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0)
  })
})

describe('Settings', () => {
  it('shows the saved profile and saves new defaults', async () => {
    const user = userEvent.setup()
    at('/settings', <SettingsPage />, '/settings')
    expect(await screen.findByDisplayValue('Alice Rao')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Pune')).toBeInTheDocument()
    expect(screen.getByLabelText('Tiles (%)')).toHaveValue(7)  // the recommended default
    await user.clear(screen.getByLabelText('Tiles (%)'))
    await user.type(screen.getByLabelText('Tiles (%)'), '10')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(a.updateProfile).toHaveBeenCalledTimes(1))
    expect(a.updateProfile.mock.calls[0][0]).toMatchObject({ full_name: 'Alice Rao', default_city: 'Pune', default_wastage: { tiles: 10, cement: 3, steel: 5, paint: 5 } })
    expect(await screen.findByText(/New projects use these defaults/)).toBeInTheDocument()
  })
  it('refuses a wastage outside 0 to 50', async () => {
    const user = userEvent.setup()
    at('/settings', <SettingsPage />, '/settings')
    await user.clear(await screen.findByLabelText('Tiles (%)'))
    await user.type(screen.getByLabelText('Tiles (%)'), '60')
    // the message appears under the box while typing, and saving is blocked
    expect(await screen.findByText('Must be between 0 and 50 %.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    expect(a.updateProfile).not.toHaveBeenCalled()
  })
})

describe('3D Building Studio', () => {
  const open = async () => { const user = userEvent.setup(); at('/studio/:projectId?', <Studio />, `/studio/${pid}`); await screen.findByTestId('viewer-3d'); return user }

  it('builds the demo building from the real rooms: valid layout, building facts, room list', async () => {
    await open()
    expect(screen.getByText('3D Building Studio')).toBeInTheDocument()
    expect(await screen.findByText('Layout validation')).toBeInTheDocument()
    expect(screen.getByText('Valid')).toBeInTheDocument()  // reachable rooms, no overlaps, as in the original
    expect(screen.getByText('10 m × 8 m')).toBeInTheDocument()
    expect(screen.getByText('Rooms (10)')).toBeInTheDocument()
    for (const r of F.project.rooms) expect(screen.getAllByText(r.name).length).toBeGreaterThan(0)
  })

  it('selecting a room shows its details and lets them be edited', async () => {
    const user = await open()
    const list = screen.getByText('Rooms (10)').closest('.rounded-xl') as HTMLElement
    await user.click(within(list).getByRole('button', { name: /Master Bedroom/ }))
    expect(await screen.findByText('Room information')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save & update model/ })).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()  // length of the room
  })

  it('switches to the 2D plan of the same geometry', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: '2D plan' }))
    expect(await screen.findByRole('img', { name: '2D floor plan of floor 1' })).toBeInTheDocument()
    expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument()
  })

  it('saves the layout with the project in the format the API accepts', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /Save layout/ }))
    await waitFor(() => expect(a.saveLayout).toHaveBeenCalledTimes(1))
    const [id, layout] = a.saveLayout.mock.calls[0]
    expect(id).toBe(pid)
    expect(layout).toMatchObject({ version: 1, openings: null, furniture: null })
    expect(typeof layout.signature).toBe('string')
    expect(layout.summary.doors.length).toBeGreaterThan(0)
    expect(layout.summary.windows.length).toBeGreaterThan(0)
    expect(await screen.findByText(/Layout saved with the project/)).toBeInTheDocument()
  })

  it('resets to the automatic layout only after confirmation', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /Reset layout/ }))
    expect(await screen.findByText('Reset the layout?')).toBeInTheDocument()
    expect(a.resetLayout).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(a.resetLayout).toHaveBeenCalledWith(pid))
  })

  it('opens the layout generator and the floor plan upload', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: /From building details/ }))
    expect(await screen.findByText('Generate from building details')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Apply to project/ })).toBeInTheDocument()
  })

  it('has every control from the design', async () => {
    await open()
    for (const name of ['Exterior', 'Top-down plan', '2D plan', 'Reset camera', 'Labels', 'Roof', 'Walls', 'Doors & windows', 'Furniture', 'Wireframe', /Upload 2D plan/, /From building details/, /Edit floor plan/, /View 3D model/, /Regenerate layout/, /Reset layout/, /Save layout/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /Doors (open|closed)/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Floor')).toHaveValue('all')
  })
})
