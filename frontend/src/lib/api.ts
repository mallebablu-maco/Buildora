import type {
  Dashboard, DetectResult, Estimate, ExtraCostConfig, FloorPlan, Material, Project, ProjectBase, ProjectCreate, ProjectDetail,
  Recommendation, Report, Room, RoomInput,
} from '@/types'
import type { SavedLayout } from '@/features/studio/layoutStore'
import { env } from './env'
import { getSupabase } from './supabase'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** FastAPI sends either a plain message or a list of {loc, msg} validation problems. */
export function errorMessage(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(' › ')}: ${d.msg ?? 'invalid'}`.replace(/^: /, ''))
    if (parts.length) return `Please check the form: ${parts.join('; ')}`
  }
  if ([502, 503, 504].includes(status)) return 'The Buildora server is not reachable right now. Please try again in a moment.'
  return `Request failed (${status}).`
}

/** Call the Buildora API with the signed-in user's Supabase access token. Returns the raw response (for files). */
export async function apiRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await getSupabase().auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    res = await fetch(`${env.apiBase}/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the Buildora server. Check your connection and try again.')
  }
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, errorMessage(res.status, body))
  }
  return res
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiRaw(path, init)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const body = (data: unknown) => JSON.stringify(data)

/** Every call the pages make. One place, so the shape of the API is easy to see. */
export const api = {
  // dashboard / demo
  dashboard: () => apiFetch<Dashboard>('/dashboard'),
  seedDemo: () => apiFetch<ProjectDetail>('/demo/seed', { method: 'POST' }),
  // projects
  projects: () => apiFetch<Project[]>('/projects'),
  project: (id: string) => apiFetch<ProjectDetail>(`/projects/${id}`),
  createProject: (d: ProjectCreate) => apiFetch<ProjectDetail>('/projects', { method: 'POST', body: body(d) }),
  updateProject: (id: string, d: ProjectBase) => apiFetch<ProjectDetail>(`/projects/${id}`, { method: 'PUT', body: body(d) }),
  deleteProject: (id: string) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
  updateConfig: (id: string, d: {
    assumptions?: Record<string, unknown>; wastage?: Record<string, number>; material_selections?: Record<string, string | null>
    extra_costs?: Record<string, ExtraCostConfig>; purchase_quantities?: Record<string, number | null>
  }) => apiFetch<ProjectDetail>(`/projects/${id}/config`, { method: 'PUT', body: body(d) }),
  // rooms
  addRoom: (pid: string, d: RoomInput) => apiFetch<Room>(`/projects/${pid}/rooms`, { method: 'POST', body: body(d) }),
  updateRoom: (pid: string, rid: string, d: RoomInput) => apiFetch<Room>(`/projects/${pid}/rooms/${rid}`, { method: 'PUT', body: body(d) }),
  deleteRoom: (pid: string, rid: string) => apiFetch<void>(`/projects/${pid}/rooms/${rid}`, { method: 'DELETE' }),
  replaceRooms: (pid: string, rooms: RoomInput[]) => apiFetch<Room[]>(`/projects/${pid}/rooms`, { method: 'PUT', body: body({ rooms }) }),
  saveLayout: (pid: string, layout: SavedLayout) => apiFetch<ProjectDetail>(`/projects/${pid}/layout`, { method: 'PUT', body: body(layout) }),
  resetLayout: (pid: string) => apiFetch<ProjectDetail>(`/projects/${pid}/layout`, { method: 'DELETE' }),
  // estimate
  runEstimate: (pid: string, overrides?: { material_selections?: Record<string, string | null>; wastage?: Record<string, number> }) =>
    apiFetch<Estimate>(`/projects/${pid}/estimate`, { method: 'POST', body: body(overrides ? { persist: false, ...overrides } : {}) }),
  getEstimate: (pid: string) => apiFetch<Estimate>(`/projects/${pid}/estimate`),
  recommendations: (pid: string) => apiFetch<Recommendation[]>(`/projects/${pid}/recommendations`),
  // floor plans
  uploadFloorplan: (pid: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch<FloorPlan>(`/projects/${pid}/floorplans`, { method: 'POST', body: fd })
  },
  deleteFloorplan: (id: string) => apiFetch<void>(`/floorplans/${id}`, { method: 'DELETE' }),
  calibrate: (id: string, d: { x1: number; y1: number; x2: number; y2: number; real_length_m: number }) =>
    apiFetch<FloorPlan>(`/floorplans/${id}/calibration`, { method: 'PUT', body: body(d) }),
  analyzeFloorplan: (id: string) => apiFetch<{ overlay_png_base64: string; edges_png_base64: string; contour_count: number; disclaimer: string }>(`/floorplans/${id}/analyze`, { method: 'POST' }),
  detectRooms: (id: string) => apiFetch<DetectResult>(`/floorplans/${id}/detect-rooms`, { method: 'POST' }),
  floorplanBlob: async (id: string) => (await apiRaw(`/floorplans/${id}/file`)).blob(),
  // materials / prices
  materials: (estimate_key?: string) => apiFetch<Material[]>(`/materials${estimate_key ? `?estimate_key=${estimate_key}` : ''}`),
  createMaterial: (d: Record<string, unknown>) => apiFetch<Material>('/materials', { method: 'POST', body: body(d) }),
  updateMaterial: (id: string, d: Record<string, unknown>) => apiFetch<Material>(`/materials/${id}`, { method: 'PUT', body: body(d) }),
  deleteMaterial: (id: string) => apiFetch<void>(`/materials/${id}`, { method: 'DELETE' }),
  createPrice: (d: { material_id: string; unit_price: number; supplier?: string; location?: string; currency?: string }) =>
    apiFetch<unknown>('/prices', { method: 'POST', body: body(d) }),
  updatePrice: (id: string, d: { unit_price: number; supplier: string; location: string }) => apiFetch<unknown>(`/prices/${id}`, { method: 'PUT', body: body(d) }),
  deletePrice: (id: string) => apiFetch<void>(`/prices/${id}`, { method: 'DELETE' }),
  importPrices: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch<{ created: number; errors: { line: number; message: string }[] }>('/prices/import', { method: 'POST', body: fd })
  },
  // reports
  createReport: (pid: string) => apiFetch<Report>(`/projects/${pid}/report`, { method: 'POST' }),
  reports: () => apiFetch<Report[]>('/reports'),
  deleteReport: (id: string) => apiFetch<void>(`/reports/${id}`, { method: 'DELETE' }),
  reportBlob: async (id: string) => (await apiRaw(`/reports/${id}/download`)).blob(),
  // profile (Settings)
  profile: () => apiFetch<{ id: string; email: string; full_name: string; default_city: string; default_wastage: Record<string, number> }>('/profile'),
  updateProfile: (d: { full_name: string; default_city?: string; default_wastage?: Record<string, number> }) =>
    apiFetch<{ id: string; email: string; full_name: string; default_city: string; default_wastage: Record<string, number> }>('/profile', { method: 'PUT', body: body(d) }),
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
