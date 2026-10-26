import { apiFetch } from '@/lib/api'
import type { Project, ProjectDetail, ProjectInput, RoomInput } from './types'

export const projectsApi = {
  list: () => apiFetch<Project[]>('/projects'),
  get: (id: string) => apiFetch<ProjectDetail>(`/projects/${id}`),
  create: (body: ProjectInput & { rooms: RoomInput[] }) => apiFetch<ProjectDetail>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
}
