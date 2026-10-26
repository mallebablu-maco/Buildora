import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { renderApp } from '@/test/render'
import { projectsApi } from './api'
import MyProjectsPage from './MyProjectsPage'
import type { Project } from './types'

vi.mock('./api', () => ({ projectsApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), remove: vi.fn() } }))

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', name: 'Sample G+1 Residence', description: '', owner_name: '', building_type: 'residential', location: 'Pune', floors: 2, currency: 'INR',
  budget: 1500000, length: 12, width: 9, height: 3, wall_thickness: 0.23, slab_thickness: 0.15, built_up_area: null,
  created_at: '2026-10-07T09:00:00Z', updated_at: '2026-10-07T09:00:00Z', room_count: 9, floor_area: 108, total_built_up_area: 216, ...over,
})

const page = <Routes><Route path="/projects" element={<MyProjectsPage />} /><Route path="/projects/new" element={<p>new project page</p>} /><Route path="/projects/:id" element={<p>project page</p>} /></Routes>

beforeEach(() => vi.resetAllMocks())

describe('MyProjectsPage', () => {
  it('lists the projects with their key facts', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([project(), project({ id: 'p2', name: 'Kothrud Row House', location: '', floors: 1, room_count: 0, total_built_up_area: 150 })])
    renderApp(page, '/projects')
    expect(screen.getByText('Loading your projects…')).toBeInTheDocument()
    const row = (await screen.findByRole('link', { name: 'Sample G+1 Residence' })).closest('tr')!
    expect(within(row).getByText('Pune')).toBeInTheDocument()
    expect(within(row).getByText('216 m²')).toBeInTheDocument()
    expect(within(row).getByText('9')).toBeInTheDocument()
    expect(screen.getByText('2 projects')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kothrud Row House' })).toHaveAttribute('href', '/projects/p2')
  })

  it('shows a friendly empty state with a way to create the first project', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([])
    renderApp(page, '/projects')
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create project' })).toHaveAttribute('href', '/projects/new')
  })

  it('explains a failure and lets the user retry', async () => {
    vi.mocked(projectsApi.list).mockRejectedValueOnce(new ApiError(503, 'The database is unavailable. Please try again shortly.')).mockResolvedValueOnce([project()])
    const user = userEvent.setup()
    renderApp(page, '/projects')
    expect(await screen.findByText('Could not load your projects')).toBeInTheDocument()
    expect(screen.getByText('The database is unavailable. Please try again shortly.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Sample G+1 Residence' })).toBeInTheDocument()
  })

  it('asks before deleting, and does nothing if cancelled', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([project()])
    const user = userEvent.setup()
    renderApp(page, '/projects')
    await user.click(await screen.findByRole('button', { name: 'Delete Sample G+1 Residence' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Delete “Sample G+1 Residence”?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(projectsApi.remove).not.toHaveBeenCalled()
  })

  it('Escape also cancels the dialog', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([project()])
    const user = userEvent.setup()
    renderApp(page, '/projects')
    await user.click(await screen.findByRole('button', { name: 'Delete Sample G+1 Residence' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes after confirmation and refreshes the list', async () => {
    vi.mocked(projectsApi.list).mockResolvedValueOnce([project()]).mockResolvedValue([])
    vi.mocked(projectsApi.remove).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderApp(page, '/projects')
    await user.click(await screen.findByRole('button', { name: 'Delete Sample G+1 Residence' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete project' }))
    await waitFor(() => expect(projectsApi.remove).toHaveBeenCalledWith('p1'))
    expect(await screen.findByText('"Sample G+1 Residence" was deleted.')).toBeInTheDocument()
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument()
  })

  it('reports a failed delete and keeps the project', async () => {
    vi.mocked(projectsApi.list).mockResolvedValue([project()])
    vi.mocked(projectsApi.remove).mockRejectedValue(new ApiError(404, 'Project not found.'))
    const user = userEvent.setup()
    renderApp(page, '/projects')
    await user.click(await screen.findByRole('button', { name: 'Delete Sample G+1 Residence' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete project' }))
    expect(await screen.findByText('Project not found.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sample G+1 Residence' })).toBeInTheDocument()
  })
})
