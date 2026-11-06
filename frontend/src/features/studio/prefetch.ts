/** The 3D view (and the 3D engine) as its own download, plus an early, idle-time fetch so the Studio opens fast. */
export const loadViewer = () => import('./BuildingViewer')

let started = false
/** Start downloading the 3D view in the background (once), unless the user saves data or is on a very slow connection. */
export function prefetchStudio3D() {
  if (started || typeof window === 'undefined') return
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? '')) return
  started = true
  const go = () => { loadViewer().catch(() => { started = false }) }
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(go, { timeout: 8000 }); else setTimeout(go, 3000)
}
