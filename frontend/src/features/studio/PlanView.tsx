import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { itemRect } from './furniture'
import type { Stair } from './stairs'
import { dragRect, rectProblem, type Grip, type Rect } from './roomEdit'
import { dist2, snapPoint, snapTargets, type Measure2D, type P2 } from './measure'
import type { FloorModel, Model3D } from './model'
import { buildPlanShapes, type PlanShapes } from './plan2d'

const ROOM_FILL: Record<string, string> = {
  living: '#e0ecfb', bedroom: '#ece6fa', kitchen: '#fdf1d2', bathroom: '#d9f3ef', dining: '#fde4e7', study: '#dcf4e8', store: '#e8ecf1',
  balcony: '#eaf6d4', corridor: '#f1f4f8', staircase: '#fbe3ef', office: '#dcf0fb', other: '#edf0f4',
}
const FURN_FILL: Record<string, string> = {
  rug: '#d9cdbd', sofa: '#7d8fa5', sofa_l: '#7d8fa5', bed_double: '#f0ece4', bed_single: '#f0ece4', counter: '#8a8f94', island: '#8a8f94', fridge: '#cfd5da',
  toilet: '#ffffff', basin: '#ffffff', bathtub: '#ffffff', shower: '#d7e6ee', mirror: '#c6dbe7', sink: '#b9c2ca', stove: '#4a4d52',
}

export type PlanMode = 'select' | 'add-door' | 'add-window'

interface Props {
  model: Model3D
  floorIndex: number
  selectedRoomId: string | null
  selectedFurnitureId: string | null
  selectedOpeningId: string | null
  onSelectRoom: (id: string | null) => void
  onSelectFurniture: (id: string | null) => void
  onSelectOpening: (id: string | null) => void
  showFurniture: boolean
  showLabels: boolean
  mode: PlanMode
  /** returns a reason string when the furniture cannot stand there, null when fine */
  canPlaceFurniture: (id: string, cx: number, cz: number) => string | null
  onMoveFurniture: (id: string, cx: number, cz: number) => void
  /** returns true when the opening can sit at this centre */
  canMoveOpening: (id: string, center: number) => boolean
  onMoveOpening: (id: string, center: number) => void
  onAddOpening: (kind: 'door' | 'window', wallId: string, along: number) => void
  onMessage: (message: string) => void
  /** move / resize a room (building-local metres); when missing, rooms cannot be dragged */
  onChangeRoom?: (id: string, rect: { pos_x: number; pos_y: number; length: number; width: number }) => Promise<void>
  /** measuring: clicks place measurement points instead of selecting / dragging */
  measure?: { items: Measure2D[]; onAdd: (m: Measure2D) => void; fmt: (metres: number) => string } | null
}

const snap = (v: number, s = 0.05) => Math.round(v / s) * s
/** Plan rectangles are {x, y, w, h}; SVG needs width / height (spreading them directly drew nothing). */
const svgRect = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, width: r.w, height: r.h })

export function PlanView(props: Props) {
  const { model, floorIndex, mode } = props
  const floor: FloorModel | undefined = model.floors.find((f) => f.index === floorIndex) ?? model.floors[0]
  const shapes: PlanShapes | null = useMemo(() => (floor ? buildPlanShapes(floor, model) : null), [floor, model])
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ kind: 'furniture' | 'opening'; id: string; cx: number; cz: number; ok: boolean; dx: number; dz: number } | null>(null)
  const [roomDrag, setRoomDrag] = useState<{ id: string; grip: Grip; start: Rect; px: number; pz: number; rect: Rect; problem: string | null; moved: boolean; saving?: boolean } | null>(null)
  const justDragged = useRef(false)
  const [mPending, setMPending] = useState<P2 | null>(null)
  const [mHover, setMHover] = useState<P2 | null>(null)
  const measuring = !!props.measure
  const targets = useMemo(() => (floor && measuring ? snapTargets(floor, model) : null), [floor, model, measuring])
  useEffect(() => { if (!measuring) { setMPending(null); setMHover(null) } }, [measuring])
  // Esc first drops a half-finished measurement (before the Studio's own Esc handling)
  useEffect(() => {
    if (!mPending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMPending(null) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [mPending])

  if (!floor || !shapes) return null
  const { view, fontSize: fs } = shapes
  const lw = Math.max(0.03, fs * 0.12)

  const toPlan = (e: React.PointerEvent | React.MouseEvent) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const m = svg.getScreenCTM()!.inverse()
    const p = pt.matrixTransform(m)
    return { x: p.x, z: p.y }
  }

  const startFurnitureDrag = (e: React.PointerEvent, id: string) => {
    if (mode !== 'select') return
    e.stopPropagation()
    props.onSelectFurniture(id)
    const it = floor.furnitureItems.find((i) => i.id === id)!
    const p = toPlan(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag({ kind: 'furniture', id, cx: it.cx, cz: it.cz, ok: true, dx: it.cx - p.x, dz: it.cz - p.z })
  }
  const startOpeningDrag = (e: React.PointerEvent, id: string) => {
    if (mode !== 'select') return
    e.stopPropagation()
    props.onSelectOpening(id)
    const o = floor.openings.find((x) => x.id === id)!
    const p = toPlan(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag({ kind: 'opening', id, cx: o.center, cz: 0, ok: true, dx: o.center - (o.orientation === 'x' ? p.x : p.z), dz: 0 })
  }
  // ---- rooms: drag the selected room to move it, its edges / corners to resize it ----
  const bounds: Rect = { x0: -model.length / 2, x1: model.length / 2, z0: -model.width / 2, z1: model.width / 2 }
  const others = (id: string) => floor.rooms.filter((r) => r.id !== id).map((r) => ({ rect: { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }, name: r.name }))
  const startRoomDrag = (e: React.PointerEvent, id: string, grip: Grip) => {
    if (mode !== 'select' || !props.onChangeRoom || roomDrag?.saving) return
    if (grip === 'move' && id !== props.selectedRoomId) return // first click selects, then drag
    e.stopPropagation()
    if (floor.schematic) { props.onMessage('Press "Save this layout" first, so every room has a fixed position. Then you can drag rooms.'); return }
    const r = floor.rooms.find((x) => x.id === id)!
    const p = toPlan(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const start = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }
    setRoomDrag({ id, grip, start, px: p.x, pz: p.z, rect: start, problem: null, moved: false })
  }
  const onRoomMove = (e: React.PointerEvent) => {
    if (!roomDrag || roomDrag.saving) return
    const p = toPlan(e)
    const dx = p.x - roomDrag.px, dz = p.z - roomDrag.pz
    if (!roomDrag.moved && Math.hypot(dx, dz) < 0.05) return
    const ot = others(roomDrag.id)
    const rect = dragRect(roomDrag.start, roomDrag.grip, dx, dz, ot.map((o) => o.rect), bounds)
    setRoomDrag({ ...roomDrag, rect, problem: rectProblem(rect, ot, bounds), moved: true })
  }
  const onRoomUp = async () => {
    if (!roomDrag || roomDrag.saving) return
    const { id, rect, start, problem, moved } = roomDrag
    if (moved) justDragged.current = true
    const same = Math.abs(rect.x0 - start.x0) < 1e-6 && Math.abs(rect.x1 - start.x1) < 1e-6 && Math.abs(rect.z0 - start.z0) < 1e-6 && Math.abs(rect.z1 - start.z1) < 1e-6
    if (!moved || same) { setRoomDrag(null); return }
    if (problem) { props.onMessage(`The room was not moved: ${problem}`); setRoomDrag(null); return }
    setRoomDrag({ ...roomDrag, saving: true })
    const r3 = (v: number) => Math.round(v * 1000) / 1000
    try {
      await props.onChangeRoom!(id, { pos_x: r3(rect.x0 + model.length / 2), pos_y: r3(rect.z0 + model.width / 2), length: r3(rect.x1 - rect.x0), width: r3(rect.z1 - rect.z0) })
    } finally { setRoomDrag(null) }
  }

  const onMove = (e: React.PointerEvent) => {
    if (roomDrag) { onRoomMove(e); return }
    if (!drag) return
    const p = toPlan(e)
    if (drag.kind === 'furniture') {
      const cx = snap(p.x + drag.dx), cz = snap(p.z + drag.dz)
      setDrag({ ...drag, cx, cz, ok: props.canPlaceFurniture(drag.id, cx, cz) === null })
    } else {
      const o = floor.openings.find((x) => x.id === drag.id)!
      const c = snap((o.orientation === 'x' ? p.x : p.z) + drag.dx)
      setDrag({ ...drag, cx: c, ok: props.canMoveOpening(drag.id, c) })
    }
  }
  const onUp = () => {
    if (roomDrag) { void onRoomUp(); return }
    if (!drag) return
    if (drag.kind === 'furniture') {
      const it = floor.furnitureItems.find((i) => i.id === drag.id)!
      if (Math.abs(drag.cx - it.cx) > 1e-6 || Math.abs(drag.cz - it.cz) > 1e-6) {
        const why = props.canPlaceFurniture(drag.id, drag.cx, drag.cz)
        if (why) props.onMessage(`Can't place it there: ${why}`)
        else props.onMoveFurniture(drag.id, drag.cx, drag.cz)
      }
    } else {
      const o = floor.openings.find((x) => x.id === drag.id)!
      if (Math.abs(drag.cx - o.center) > 1e-6) {
        if (props.canMoveOpening(drag.id, drag.cx)) props.onMoveOpening(drag.id, drag.cx)
        else props.onMessage('Not enough free wall space there (walls, corners and other openings must stay clear).')
      }
    }
    setDrag(null)
  }

  const wallClick = (e: React.MouseEvent, wallId: string) => {
    if (mode === 'select') return
    e.stopPropagation()
    const p = toPlan(e)
    const w = floor.walls.find((x) => x.id === wallId)!
    props.onAddOpening(mode === 'add-door' ? 'door' : 'window', wallId, snap(w.orientation === 'x' ? p.x : p.z))
  }

  const L = model.length, W = model.width
  const dimY = view.y + view.h - fs * 2.2, dimX = view.x + view.w - fs * 2.2
  const tick = fs * 0.5

  return (
    <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className={cn('h-full w-full touch-none select-none bg-white', (mode !== 'select' || measuring) && 'cursor-crosshair')}
      role="img" aria-label={`2D floor plan of floor ${floor.index}`} onPointerMove={(e) => { if (measuring) { const q = toPlan(e); setMHover(snapPoint([q.x, q.z], targets!).p); return } onMove(e) }} onPointerUp={onUp}
      onPointerDownCapture={(e) => {
        if (!measuring || e.button !== 0) return
        e.stopPropagation()
        const q = toPlan(e), pt = snapPoint([q.x, q.z], targets!).p
        if (!mPending) setMPending(pt)
        else { if (dist2(mPending, pt) > 0.01) props.measure!.onAdd({ a: mPending, b: pt }); setMPending(null) }
      }}
      onClickCapture={(e) => { if (measuring) e.stopPropagation() }}
      onClick={() => { if (justDragged.current) { justDragged.current = false; return } props.onSelectRoom(null); props.onSelectFurniture(null); props.onSelectOpening(null) }}>
      <defs>
        <pattern id="plan-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#eef1f5" strokeWidth={lw * 0.4} /></pattern>
      </defs>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#plan-grid)" />
      <rect {...svgRect(shapes.footprint)} fill="#fff" />

      {shapes.rooms.map((r) => (
        <g key={r.id} onPointerDown={(e) => startRoomDrag(e, r.id, 'move')}
          onClick={(e) => { if (mode !== 'select') return; e.stopPropagation(); if (justDragged.current) { justDragged.current = false; return } props.onSelectRoom(r.id === props.selectedRoomId ? null : r.id) }}
          className={mode === 'select' ? (r.id === props.selectedRoomId && props.onChangeRoom ? 'cursor-move' : 'cursor-pointer') : ''}>
          <rect {...svgRect(r.rect)} fill={ROOM_FILL[r.type] ?? ROOM_FILL.other} />
          {r.id === props.selectedRoomId && <rect {...svgRect(r.rect)} fill="#f97316" fillOpacity={0.22} stroke="#ea580c" strokeWidth={lw * 1.5} />}
        </g>
      ))}

      {/* stairs: treads + walking direction on this floor; the stairs below shown dashed inside a stairwell */}
      <g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {floor.stairs.map((st) => <StairLines key={st.roomId} s={st} lw={lw} />)}
        {(model.floors[floor.index - 2]?.stairs ?? []).map((st) => <StairLines key={`b${st.roomId}`} s={st} lw={lw} below />)}
      </g>

      {props.showFurniture && shapes.furniture.map((f) => {
        const moving = drag?.kind === 'furniture' && drag.id === f.id
        const it = floor.furnitureItems.find((i) => i.id === f.id)!
        const r = moving ? itemRect({ ...it, cx: drag.cx, cz: drag.cz }) : null
        const x = r ? r.x0 : f.rect.x, y = r ? r.z0 : f.rect.y
        const sel = f.id === props.selectedFurnitureId
        return (
          <g key={f.id} onPointerDown={(e) => startFurnitureDrag(e, f.id)} className={mode === 'select' ? 'cursor-grab' : ''} onClick={(e) => e.stopPropagation()}>
            <rect x={x} y={y} width={f.rect.w} height={f.rect.h} rx={Math.min(f.rect.w, f.rect.h) * 0.08} fill={FURN_FILL[f.type] ?? '#c9b79c'} fillOpacity={f.type === 'rug' ? 0.7 : 0.95}
              stroke={moving ? (drag.ok ? '#16a34a' : '#dc2626') : sel ? '#ea580c' : '#64748b'} strokeWidth={sel || moving ? lw * 1.6 : lw * 0.6} />
          </g>
        )
      })}

      {shapes.walls.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill={w.exterior ? '#1e293b' : '#334155'} onClick={(e) => wallClick(e, w.wallId)}
          className={mode !== 'select' ? 'cursor-crosshair' : ''} />
      ))}
      {mode !== 'select' && shapes.walls.map((w, i) => ( // fat invisible hit area so thin walls are easy to click
        <rect key={`h${i}`} x={w.x - 0.15} y={w.y - 0.15} width={w.w + 0.3} height={w.h + 0.3} fill="transparent" onClick={(e) => wallClick(e, w.wallId)} className="cursor-crosshair" />
      ))}

      {shapes.windows.map((wd) => {
        const sel = wd.id === props.selectedOpeningId, moving = drag?.kind === 'opening' && drag.id === wd.id
        const o = wd.opening
        const shift = moving ? drag.cx - o.center : 0
        const tr = o.orientation === 'x' ? `translate(${shift} 0)` : `translate(0 ${shift})`
        return (
          <g key={wd.id} transform={tr} onPointerDown={(e) => startOpeningDrag(e, wd.id)} onClick={(e) => e.stopPropagation()} className={mode === 'select' ? 'cursor-grab' : ''}>
            <rect {...svgRect(wd.rect)} fill="#fff" stroke={moving ? (drag.ok ? '#16a34a' : '#dc2626') : sel ? '#ea580c' : '#38bdf8'} strokeWidth={sel || moving ? lw * 1.8 : lw * 0.8} />
            {wd.glass.map((g, k) => <line key={k} x1={g[0]} y1={g[1]} x2={g[2]} y2={g[3]} stroke="#38bdf8" strokeWidth={lw * 0.7} />)}
          </g>
        )
      })}

      {shapes.doors.map((d) => {
        const sel = d.id === props.selectedOpeningId, moving = drag?.kind === 'opening' && drag.id === d.id
        const o = d.opening
        const shift = moving ? drag.cx - o.center : 0
        const tr = o.orientation === 'x' ? `translate(${shift} 0)` : `translate(0 ${shift})`
        const col = moving ? (drag.ok ? '#16a34a' : '#dc2626') : sel ? '#ea580c' : d.entrance ? '#b45309' : '#92613a'
        const t = o.thickness
        const gap = o.orientation === 'x'
          ? { x: o.center - o.width / 2, y: o.line - t / 2, width: o.width, height: t }
          : { x: o.line - t / 2, y: o.center - o.width / 2, width: t, height: o.width }
        return (
          <g key={d.id} transform={tr} onPointerDown={(e) => startOpeningDrag(e, d.id)} onClick={(e) => e.stopPropagation()} className={mode === 'select' ? 'cursor-grab' : ''}>
            <rect {...gap} fill="#fff" fillOpacity={0.9} />
            <path d={d.arc} fill="none" stroke={col} strokeWidth={lw * 0.7} strokeDasharray={`${lw * 2} ${lw * 2}`} />
            <line x1={d.hinge[0]} y1={d.hinge[1]} x2={d.openEnd[0]} y2={d.openEnd[1]} stroke={col} strokeWidth={lw * 1.6} strokeLinecap="round" />
            {/* wide invisible grab area */}
            <rect x={gap.x - 0.1} y={gap.y - 0.1} width={gap.width + 0.2} height={gap.height + 0.2} fill="transparent" />
          </g>
        )
      })}

      {shapes.rooms.map((r) => {
        const small = r.rect.w < fs * 7 || r.rect.h < fs * 3.2
        return (
          <g key={`t${r.id}`} pointerEvents="none" textAnchor="middle">
            <text x={r.rect.x + r.rect.w / 2} y={r.rect.y + r.rect.h / 2 - (small ? 0 : fs * 0.2)} fontSize={fs * (small ? 0.8 : 1)} fontWeight={700} fill="#0b1f3a" dominantBaseline="middle">{r.name}</text>
            {!small && <text x={r.rect.x + r.rect.w / 2} y={r.rect.y + r.rect.h / 2 + fs * 0.95} fontSize={fs * 0.78} fill="#475569" dominantBaseline="middle">{r.dims} · {r.area.toFixed(1)} m²</text>}
          </g>
        )
      })}

      {/* overall dimensions */}
      <g pointerEvents="none" stroke="#0b1f3a" strokeWidth={lw * 0.7} fill="#0b1f3a" fontSize={fs * 0.95}>
        <line x1={-L / 2} y1={dimY} x2={L / 2} y2={dimY} />
        <line x1={-L / 2} y1={dimY - tick} x2={-L / 2} y2={dimY + tick} /><line x1={L / 2} y1={dimY - tick} x2={L / 2} y2={dimY + tick} />
        <text x={0} y={dimY - fs * 0.5} textAnchor="middle" stroke="none">{L.toFixed(2)} m</text>
        <line x1={dimX} y1={-W / 2} x2={dimX} y2={W / 2} />
        <line x1={dimX - tick} y1={-W / 2} x2={dimX + tick} y2={-W / 2} /><line x1={dimX - tick} y1={W / 2} x2={dimX + tick} y2={W / 2} />
        <text x={dimX - fs * 0.5} y={0} textAnchor="middle" stroke="none" transform={`rotate(-90 ${dimX - fs * 0.5} 0)`}>{W.toFixed(2)} m</text>
      </g>
      <text x={view.x + fs * 0.6} y={view.y + fs * 1.4} fontSize={fs * 0.9} fill="#64748b" pointerEvents="none">Floor {floor.index} · N ↑</text>
      {props.measure && (
        <MeasureLayer items={props.measure.items} pending={mPending} hover={mHover} fmt={props.measure.fmt} lw={lw} fs={fs} />
      )}
      {props.onChangeRoom && !measuring && mode === 'select' && props.selectedRoomId && !roomDrag && floor.rooms.some((r) => r.id === props.selectedRoomId) && (
        <text x={view.x + fs * 0.6} y={view.y + fs * 2.6} fontSize={fs * 0.8} fill="#64748b" pointerEvents="none">Drag the room to move it · drag its edges or corners to resize</text>
      )}
      <RoomEditOverlay floor={floor} selectedId={mode === 'select' && props.onChangeRoom && !measuring ? props.selectedRoomId : null} drag={roomDrag} lw={lw} fs={fs} onGrip={startRoomDrag} />
    </svg>
  )
}

function StairLines({ s, lw, below = false }: { s: Stair; lw: number; below?: boolean }) {
  const col = below ? '#94a3b8' : '#475569'
  const dash = below ? `${lw * 3} ${lw * 2}` : undefined
  const { rect: c } = s
  const arrow = s.planArrow
  const end = arrow[arrow.length - 1], prev = arrow[arrow.length - 2]
  const ang = end && prev ? Math.atan2(end[1] - prev[1], end[0] - prev[0]) : 0
  const ah = Math.min(0.25, (Math.min(c.x1 - c.x0, c.z1 - c.z0)) * 0.2)
  return (
    <g stroke={col} strokeDasharray={dash}>
      <rect x={c.x0} y={c.z0} width={c.x1 - c.x0} height={c.z1 - c.z0} strokeWidth={lw * 0.8} />
      {s.planTreads.map((t, i) => s.axis === 'x'
        ? <line key={i} x1={t.at} y1={t.c0} x2={t.at} y2={t.c1} strokeWidth={lw * 0.6} />
        : <line key={i} x1={t.c0} y1={t.at} x2={t.c1} y2={t.at} strokeWidth={lw * 0.6} />)}
      {s.kind === 'u' && (s.axis === 'x'
        ? <line x1={Math.min(...s.planTreads.map((t) => t.at))} y1={(c.z0 + c.z1) / 2} x2={Math.max(...s.planTreads.map((t) => t.at))} y2={(c.z0 + c.z1) / 2} strokeWidth={lw * 0.8} />
        : <line x1={(c.x0 + c.x1) / 2} y1={Math.min(...s.planTreads.map((t) => t.at))} x2={(c.x0 + c.x1) / 2} y2={Math.max(...s.planTreads.map((t) => t.at))} strokeWidth={lw * 0.8} />)}
      {!below && arrow.length > 1 && (
        <>
          <polyline points={arrow.map((p) => p.join(',')).join(' ')} stroke="#0f766e" strokeWidth={lw} strokeDasharray={undefined} />
          <polyline stroke="#0f766e" strokeWidth={lw} points={[
            [end[0] - ah * Math.cos(ang - 0.5), end[1] - ah * Math.sin(ang - 0.5)], end, [end[0] - ah * Math.cos(ang + 0.5), end[1] - ah * Math.sin(ang + 0.5)],
          ].map((p) => p.join(',')).join(' ')} />
        </>
      )}
    </g>
  )
}

const GRIPS: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const CURSOR: Record<Grip, string> = { move: 'move', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }

/** Resize handles on the selected room, and the live outline (green = fits, red = does not) while dragging. */
function RoomEditOverlay({ floor, selectedId, drag, lw, fs, onGrip }: {
  floor: FloorModel; selectedId: string | null; lw: number; fs: number
  drag: { id: string; rect: Rect; problem: string | null; moved: boolean; saving?: boolean } | null
  onGrip: (e: React.PointerEvent, id: string, grip: Grip) => void
}) {
  const room = selectedId ? floor.rooms.find((r) => r.id === selectedId) : null
  const live = drag?.moved ? drag : null
  const r = live ? live.rect : room ? { x0: room.x0, x1: room.x1, z0: room.z0, z1: room.z1 } : null
  if (!r) return null
  const id = live?.id ?? room!.id
  const hs = Math.max(fs * 0.5, lw * 4)
  const at = (g: Grip): [number, number] => [g.includes('w') ? r.x0 : g.includes('e') ? r.x1 : (r.x0 + r.x1) / 2, g.includes('n') ? r.z0 : g.includes('s') ? r.z1 : (r.z0 + r.z1) / 2]
  const col = live ? (live.problem ? '#dc2626' : '#16a34a') : '#ea580c'
  return (
    <g>
      {live && (
        <>
          <rect x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} fill={col} fillOpacity={0.12} stroke={col} strokeWidth={lw * 2} strokeDasharray={`${lw * 4} ${lw * 2}`} pointerEvents="none" />
          <text x={(r.x0 + r.x1) / 2} y={r.z0 - fs * 0.4} textAnchor="middle" fontSize={fs * 0.85} fill={col} fontWeight={600} pointerEvents="none">
            {live.saving ? 'Saving…' : live.problem ?? `${(r.x1 - r.x0).toFixed(2)} × ${(r.z1 - r.z0).toFixed(2)} m · ${((r.x1 - r.x0) * (r.z1 - r.z0)).toFixed(1)} m²`}
          </text>
        </>
      )}
      {!live && GRIPS.map((g) => {
        const [x, z] = at(g)
        return (
          <rect key={g} x={x - hs / 2} y={z - hs / 2} width={hs} height={hs} rx={hs * 0.2} fill="#fff" stroke={col} strokeWidth={lw * 1.2}
            style={{ cursor: CURSOR[g] }} onPointerDown={(e) => onGrip(e, id, g)} onClick={(e) => e.stopPropagation()} aria-label={`Resize ${g}`} />
        )
      })}
    </g>
  )
}

/** Measurement lines with their length (and the across / along parts) in the 2D plan. */
function MeasureLayer({ items, pending, hover, fmt, lw, fs }: { items: Measure2D[]; pending: P2 | null; hover: P2 | null; fmt: (m: number) => string; lw: number; fs: number }) {
  const one = (m: Measure2D, key: string, preview = false) => {
    const d = dist2(m.a, m.b)
    const dx = Math.abs(m.b[0] - m.a[0]), dz = Math.abs(m.b[1] - m.a[1])
    const mid: P2 = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2]
    const main = fmt(d), sub = dx > 0.05 && dz > 0.05 ? `↔ ${fmt(dx)} · ↕ ${fmt(dz)}` : ''
    const w = Math.max(main.length, sub.length * 0.82) * fs * 0.55 + fs * 0.8, h = sub ? fs * 2.2 : fs * 1.3
    const col = preview ? '#0f766e99' : '#0f766e'
    return (
      <g key={key}>
        <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke={col} strokeWidth={lw * 1.4} strokeDasharray={preview ? `${lw * 3} ${lw * 2}` : undefined} />
        {[m.a, m.b].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={lw * 2.2} fill="#fff" stroke={col} strokeWidth={lw} />)}
        <rect x={mid[0] - w / 2} y={mid[1] - h / 2} width={w} height={h} rx={fs * 0.25} fill="#fff" fillOpacity={0.95} stroke={col} strokeWidth={lw * 0.6} />
        <text x={mid[0]} y={mid[1] - (sub ? fs * 0.35 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 0.85} fontWeight={700} fill="#0f766e">{main}</text>
        {sub && <text x={mid[0]} y={mid[1] + fs * 0.55} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 0.65} fill="#0f766e">{sub}</text>}
      </g>
    )
  }
  return (
    <g pointerEvents="none" data-testid="measurements">
      {items.map((m, i) => one(m, `m${i}`))}
      {pending && hover && dist2(pending, hover) > 0.01 && one({ a: pending, b: hover }, 'preview', true)}
      {pending && !hover && <circle cx={pending[0]} cy={pending[1]} r={lw * 2.2} fill="#fff" stroke="#0f766e" strokeWidth={lw} />}
      {!pending && hover && <circle cx={hover[0]} cy={hover[1]} r={lw * 1.6} fill="#0f766e" fillOpacity={0.6} />}
    </g>
  )
}

