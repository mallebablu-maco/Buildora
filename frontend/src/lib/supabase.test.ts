import { describe, expect, it } from 'vitest'
import { configProblems } from './env'
import { sessionStorageAdapter as store, setKeepSignedIn } from './supabase'

describe('"Keep me logged in" storage', () => {
  it('uses localStorage by default', () => {
    store.setItem('k', 'v')
    expect(localStorage.getItem('k')).toBe('v')
    expect(sessionStorage.getItem('k')).toBeNull()
  })
  it('uses sessionStorage when the box is not ticked', () => {
    setKeepSignedIn(false)
    store.setItem('k', 'v')
    expect(sessionStorage.getItem('k')).toBe('v')
    expect(localStorage.getItem('k')).toBeNull()
  })
  it('moves the session when the choice changes', () => {
    store.setItem('k', 'one')
    setKeepSignedIn(false)
    store.setItem('k', 'two')
    expect(localStorage.getItem('k')).toBeNull()
    expect(store.getItem('k')).toBe('two')
  })
  it('reads from either storage and removes from both', () => {
    sessionStorage.setItem('a', '1')
    localStorage.setItem('b', '2')
    expect(store.getItem('a')).toBe('1')
    expect(store.getItem('b')).toBe('2')
    store.removeItem('a')
    store.removeItem('b')
    expect(store.getItem('a')).toBeNull()
    expect(store.getItem('b')).toBeNull()
  })
})

describe('configProblems', () => {
  const ok = { supabaseUrl: 'https://abc.supabase.co', supabaseKey: 'sb_publishable_x' }
  it('accepts a valid configuration', () => expect(configProblems(ok)).toEqual([]))
  it('reports missing values', () => expect(configProblems({ supabaseUrl: '', supabaseKey: '' })).toHaveLength(2))
  it('rejects a URL that is not a Supabase project URL', () => expect(configProblems({ ...ok, supabaseUrl: 'https://example.com' })).toHaveLength(1))
  it('refuses a secret key in the browser bundle', () => {
    const problems = configProblems({ ...ok, supabaseKey: 'sb_secret_abc' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/SECRET/)
  })
})
