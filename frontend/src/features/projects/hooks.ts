import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from './api'
import type { ProjectInput, RoomInput } from './types'

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
}

export const useProjects = () => useQuery({ queryKey: projectKeys.all, queryFn: () => projectsApi.list() })

export const useProject = (id: string) => useQuery({ queryKey: projectKeys.detail(id), queryFn: () => projectsApi.get(id) })

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ProjectInput & { rooms: RoomInput[] }) => projectsApi.create(body),
    onSuccess: (project) => {
      qc.setQueryData(projectKeys.detail(project.id), project)
      return qc.invalidateQueries({ queryKey: projectKeys.all, exact: true })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: projectKeys.detail(id) })
      return qc.invalidateQueries({ queryKey: projectKeys.all, exact: true })
    },
  })
}
