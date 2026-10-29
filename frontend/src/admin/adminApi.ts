import { apiFetch } from '@/lib/api'
import type { EstimateKey } from '@/types'

export interface AdminOverview {
  users_total: number
  homeowners: number
  contractors: number
  no_role: number
  new_7d: number
  new_30d: number
  active_7d: number
  active_30d: number
  by_provider: Record<string, number>
  projects: number
  estimates: number
  reports: number
  signups_per_day: { day: string; count: number }[]
}

export interface AdminUser {
  id: string
  email: string
  full_name: string
  persona: string
  providers: string[]
  created_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  is_admin: boolean
  projects: number
}

export interface AdminMaterial {
  id: string
  estimate_key: EstimateKey
  name: string
  category: string
  brand: string
  grade: string
  specification: string
  durability_notes: string
  unit: string
  is_hidden: boolean
  market_price: number | null
  currency: string
  supplier: string
  location: string
  price_is_sample: boolean
  price_updated_at: string | null
}

export type MaterialDetails = Pick<AdminMaterial, 'estimate_key' | 'name' | 'category' | 'brand' | 'grade' | 'specification' | 'durability_notes' | 'unit'>

const json = (data: unknown) => JSON.stringify(data)

/** The admin website's calls. The API refuses (403) anyone who is not an Admin, and so does the database. */
export const adminApi = {
  me: () => apiFetch<{ id: string; email: string; full_name: string; is_admin: boolean }>('/admin/me'),
  overview: () => apiFetch<AdminOverview>('/admin/overview'),
  users: () => apiFetch<AdminUser[]>('/admin/users'),
  materials: () => apiFetch<AdminMaterial[]>('/admin/materials'),
  createMaterial: (d: MaterialDetails & { unit_price: number; supplier?: string; location?: string }) =>
    apiFetch<AdminMaterial>('/admin/materials', { method: 'POST', body: json(d) }),
  updateMaterial: (id: string, d: MaterialDetails) => apiFetch<AdminMaterial>(`/admin/materials/${id}`, { method: 'PUT', body: json(d) }),
  setPrice: (id: string, d: { unit_price: number; supplier: string; location: string }) =>
    apiFetch<AdminMaterial>(`/admin/materials/${id}/price`, { method: 'PUT', body: json(d) }),
  setHidden: (id: string, hidden: boolean) => apiFetch<AdminMaterial>(`/admin/materials/${id}/hidden`, { method: 'PUT', body: json({ hidden }) }),
  importPrices: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch<{ updated: number; errors: { line: number; message: string }[] }>('/admin/prices/import', { method: 'POST', body: fd })
  },
}
