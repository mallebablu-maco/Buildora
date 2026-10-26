import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { configProblems, env } from './env'

/**
 * "Keep me logged in": when ticked the session is stored in localStorage (survives closing the browser); when not, in
 * sessionStorage (gone when the tab closes). The choice is recorded before signing in so the session lands in the right place.
 */
const KEEP_KEY = 'buildora.keep-signed-in'

export function setKeepSignedIn(keep: boolean) {
  try {
    localStorage.setItem(KEEP_KEY, keep ? '1' : '0')
  } catch {
    /* storage unavailable (private mode): the session simply stays in memory for this page */
  }
}

function keepSignedIn() {
  try {
    return localStorage.getItem(KEEP_KEY) !== '0'
  } catch {
    return true
  }
}

export const sessionStorageAdapter = {
  getItem(key: string): string | null {
    try {
      return sessionStorage.getItem(key) ?? localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string) {
    try {
      const [target, other] = keepSignedIn() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
      target.setItem(key, value)
      other.removeItem(key)
    } catch {
      /* see above */
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      /* see above */
    }
  },
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!client) {
    const problems = configProblems()
    if (problems.length) throw new Error(problems.join(' '))
    client = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { storage: sessionStorageAdapter, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
