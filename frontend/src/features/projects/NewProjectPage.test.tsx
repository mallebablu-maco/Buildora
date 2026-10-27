import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { renderApp } from '@/test/render'
import { projectsApi } from './api'
import NewProjectPage from './NewProjectPage'
import type { ProjectDetail } from './types'

vi.mock('./api', () => ({ projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), remove: vi.fn() } }))

const saved = { id: 'new-id', name: 'My House' } as ProjectDetail
const page = <Routes><Route path="/projects/new" element={<NewProjectPage />} /><Route path="/projects" element={<p>projects list</p>} /><Route path="/projects/:id" element={<p>project page</p>} /></Routes>
const setup = () => { const user = userEvent.setup(); renderApp(page, '/projects/new'); return user }
const next = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: /^Next:/ }))
const type = async (user: ReturnType<typeof userEvent.setup>, label: string, value: string) => {
  const input = screen.getByLabelText(label)
  await user.clear(input)
  if (value) await user.type(input, value)
}

beforeEach(() => vi.resetAllMocks())

describe('New project wizard', () => {
  it('starts on step 1 with the owner filled in from the account', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Project details' })).toBeInTheDocument()
    expect(screen.getByLabelText('Owner')).toHaveValue('Asha Rao')
    expect(screen.getByText('Step 1 of 4:').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('does not move on while the name is missing', async () => {
    const user = setup()
    await next(user)
    expect(await screen.findByText('Enter a project name.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project details' })).toBeInTheDocument()
  })

  it('validates the dimensions on step 2', async () => {
    const user = setup()
    await type(user, 'Project name', 'My House')
    await next(user)
    expect(screen.getByRole('heading', { name: 'Building input' })).toBeInTheDocument()
    await type(user, 'Length (m)', '0')
    await next(user)
    expect(await screen.findByText('Length must be at least 1.')).toBeInTheDocument()
    await type(user, 'Length (m)', '')
    await next(user)
    expect(await screen.findByText('Length: enter a number.')).toBeInTheDocument()
  })

  it('refuses a room on a floor the project does not have', async () => {
    const user = setup()
    await type(user, 'Project name', 'My House')
    await next(user); await next(user)
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await type(user, 'Floor', '2')
    await next(user)
    expect(await screen.findByText('The project has 1 floor(s).')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument()
  })

  it('walks through all four steps and creates the project', async () => {
    vi.mocked(projectsApi.create).mockResolvedValue(saved)
    const user = setup()
    await type(user, 'Project name', '  My House ')
    await type(user, 'Location (city)', 'Pune')
    await type(user, 'Floors', '2')
    await type(user, 'Budget (optional)', '1500000')
    await next(user)
    await type(user, 'Length (m)', '12'); await type(user, 'Width (m)', '9'); await type(user, 'Floor height (m)', '3.2')
    await next(user)
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await type(user, 'Name', 'Living'); await type(user, 'Floor', '2'); await type(user, 'Length (m)', '5'); await type(user, 'Width (m)', '4')
    await next(user)

    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByText('My House')).toBeInTheDocument()
    expect(screen.getByText('12 m × 9 m = 108 m²')).toBeInTheDocument()
    expect(screen.getByText(/Living \(Bedroom, floor 2\)/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(projectsApi.create).toHaveBeenCalledTimes(1))
    expect(vi.mocked(projectsApi.create).mock.calls[0][0]).toMatchObject({
      name: 'My House', location: 'Pune', floors: 2, budget: 1500000, currency: 'INR', length: 12, width: 9, height: 3.2, building_type: 'residential',
      rooms: [{ name: 'Living', room_type: 'bedroom', floor_number: 2, length: 5, width: 4, height: 3.2, doors: 1, windows: 1 }],
    })
    expect(await screen.findByText('project page')).toBeInTheDocument()
    expect(await screen.findByText('Project saved.')).toBeInTheDocument()
  })

  it('can go back without losing what was typed', async () => {
    const user = setup()
    await type(user, 'Project name', 'Kept')
    await next(user)
    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByLabelText('Project name')).toHaveValue('Kept')
  })

  it('shows the server message when saving fails, and stays on the review step', async () => {
    vi.mocked(projectsApi.create).mockRejectedValue(new ApiError(503, 'The database is unavailable. Please try again shortly.'))
    const user = setup()
    await type(user, 'Project name', 'My House')
    await next(user); await next(user); await next(user)
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('The database is unavailable. Please try again shortly.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
  })

  it('"Save as draft & exit" saves as soon as the details and dimensions are valid', async () => {
    vi.mocked(projectsApi.create).mockResolvedValue(saved)
    const user = setup()
    await type(user, 'Project name', 'Quick draft')
    await user.click(screen.getByRole('button', { name: 'Save as draft & exit' }))
    await waitFor(() => expect(projectsApi.create).toHaveBeenCalledTimes(1))
    expect(vi.mocked(projectsApi.create).mock.calls[0][0]).toMatchObject({ name: 'Quick draft', rooms: [] })
  })

  it('"Save as draft & exit" jumps to the first step with a problem instead of saving', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Save as draft & exit' }))
    expect(await screen.findByText('Enter a project name.')).toBeInTheDocument()
    expect(projectsApi.create).not.toHaveBeenCalled()
  })
})
