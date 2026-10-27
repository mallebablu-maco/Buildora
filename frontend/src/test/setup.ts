import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Newer Node versions ship an experimental global `localStorage` that shadows jsdom's and is not a working Storage
 * (`localStorage.getItem is not a function`). Tests install a plain in-memory Storage so they behave the same everywhere.
 */
class MemoryStorage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = new MemoryStorage() as unknown as Storage
  for (const target of [globalThis, window]) Object.defineProperty(target, name, { value: storage, configurable: true, writable: true })
}

// Browser features jsdom does not have, used by the charts, the <dialog> modals and the floor plan preview.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
}
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
URL.createObjectURL ??= () => 'blob:test'
URL.revokeObjectURL ??= () => {}

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
