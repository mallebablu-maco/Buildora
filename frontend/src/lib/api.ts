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
  return `Request failed (${status}).`
}

/** Call the Buildora API with the signed-in user's Supabase access token. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await getSupabase().auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

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
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
