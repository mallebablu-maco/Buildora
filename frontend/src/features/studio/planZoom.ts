/**
 * Zoom / pan for the 2D plan (pinch, one-finger pan when zoomed, trackpad pinch). Pure maths on the SVG viewBox,
 * with the browser's default preserveAspectRatio (xMidYMid meet).
 */
export interface VB { x: number; y: number; w: number; h: number }
export interface Zoom { k: number; cx: number; cy: number }
export interface Box2 { left: number; top: number; width: number; height: number }

export const MAX_ZOOM = 8

/** The viewBox for zoom `z` of the full plan view `base` (centre kept inside the plan). */
export function zoomedView(base: VB, z: Zoom | null): VB {
  if (!z || z.k <= 1) return base
  const w = base.w / z.k, h = base.h / z.k
  const cx = Math.min(base.x + base.w - w / 2, Math.max(base.x + w / 2, z.cx))
  const cy = Math.min(base.y + base.h - h / 2, Math.max(base.y + h / 2, z.cy))
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** Screen pixel -> plan coordinates for viewBox `vb` drawn in element box `r`. */
export function toPlanPoint(vb: VB, r: Box2, sx: number, sy: number): [number, number] {
  const s = Math.min(r.width / vb.w, r.height / vb.h)
  const ox = (r.width - vb.w * s) / 2, oy = (r.height - vb.h * s) / 2
  return [vb.x + (sx - r.left - ox) / s, vb.y + (sy - r.top - oy) / s]
}

/** Zoom to `k` so that plan point `p` ends up under screen point (sx, sy). */
export function zoomAt(base: VB, r: Box2, k: number, p: [number, number], sx: number, sy: number): Zoom {
  const kk = Math.min(MAX_ZOOM, Math.max(1, k))
  const w = base.w / kk, h = base.h / kk
  const s = Math.min(r.width / w, r.height / h)
  const ox = (r.width - w * s) / 2, oy = (r.height - h * s) / 2
  const x = p[0] - (sx - r.left - ox) / s, y = p[1] - (sy - r.top - oy) / s
  return { k: kk, cx: x + w / 2, cy: y + h / 2 }
}
