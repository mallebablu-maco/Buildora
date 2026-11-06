import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Label } from './Label'
import { floorKind, getExtraTextures, getTextures, PALETTE, WALL_TEXTURE_SIZE } from './materials'
import { DEFAULT_LOOK, floorFinishFor, type Look } from './look'
import { entranceParts, GARDEN_MARGIN, gardenParts, sunshades } from './exterior'
import { dist3, type Measure3D, type P3 } from './measure'
import { itemRect } from './furniture'
import type { Box, FloorModel, Model3D, Opening, RoomBox, Side } from './model'
import { subtractRects, type Rect, type Segment, type Stair, type StairHole } from './stairs'

export type ViewMode = 'exterior' | 'top'
export interface ViewerOptions {
  view: ViewMode
  floor: 'all' | number
  showLabels: boolean
  showRoof: boolean
  showFurniture: boolean
  showWalls: boolean
  showOpenings: boolean
  doorsOpen: boolean
  wireframe: boolean
  resetNonce: number
  /** colours and finishes (default: the original look) */
  look?: Look
}

const noRaycast = () => null

/** Lines, end points and lengths of the 3D measurements (drawn on top of everything). */
function Measurements({ items, pending, hover, fmt, size }: { items: Measure3D[]; pending: P3 | null; hover: P3 | null; fmt: (m: number) => string; size: number }) {
  const one = (m: Measure3D, key: string, preview = false) => {
    const mid: P3 = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2 + size * 0.35, (m.a[2] + m.b[2]) / 2]
    return (
      <group key={key}>
        <Line points={[m.a, m.b]} color="#0f766e" lineWidth={preview ? 2 : 3} dashed={preview} dashSize={0.15} gapSize={0.1} depthTest={false} renderOrder={30} transparent opacity={preview ? 0.7 : 1} />
        {[m.a, m.b].map((p, i) => (
          <mesh key={i} position={p} renderOrder={31} raycast={noRaycast}>
            <sphereGeometry args={[size * 0.09, 12, 12]} />
            <meshBasicMaterial color="#0f766e" depthTest={false} transparent />
          </mesh>
        ))}
        <Label text={fmt(dist3(m.a, m.b))} position={mid} size={size} active={!preview} />
      </group>
    )
  }
  return (
    <>
      {items.map((m, i) => one(m, `m${i}`))}
      {pending && hover && dist3(pending, hover) > 0.01 && one({ a: pending, b: hover }, 'preview', true)}
      {pending && !hover && <mesh position={pending} raycast={noRaycast}><sphereGeometry args={[size * 0.09, 12, 12]} /><meshBasicMaterial color="#0f766e" depthTest={false} transparent /></mesh>}
    </>
  )
}

/** Merge axis-aligned boxes into one geometry (one draw call, no per-box overhead). */
function boxesGeometry(boxes: Box[]): THREE.BufferGeometry | null {
  if (!boxes.length) return null
  const geos = boxes.map((b) => {
    const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz)
    g.translate(b.cx, b.cy, b.cz)
    return g
  })
  const merged = mergeGeometries(geos, false)
  geos.forEach((g) => g.dispose())
  return merged
}

/** Thin square bars between two points (handrails), merged into one geometry. */
function railsGeometry(segs: Segment[], t = 0.045): THREE.BufferGeometry | null {
  if (!segs.length) return null
  const geos = segs.map(({ a, b }) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
    const g = new THREE.BoxGeometry(t, t, A.distanceTo(B))
    const m = new THREE.Matrix4().lookAt(A, B, Math.abs(B.y - A.y) > 0.999 * A.distanceTo(B) ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
    m.setPosition(A.clone().add(B).multiplyScalar(0.5))
    g.applyMatrix4(m)
    return g
  })
  const merged = mergeGeometries(geos, false)
  geos.forEach((g) => g.dispose())
  return merged
}

function useRailsGeometry(segs: Segment[]) {
  const geo = useMemo(() => railsGeometry(segs), [segs])
  useEffect(() => () => { geo?.dispose() }, [geo])
  return geo
}

/**
 * Walls split into the faces on the outside of the building (on the outer wall planes) and all other faces,
 * so the outside can have its own colour or texture. UVs are in texture tiles (`tile` metres per tile).
 */
const PAINT_TILE = [1, 1] as const

function wallFaceGeometries(boxes: Box[], outerX: number, outerZ: number, tile: readonly [number, number]) {
  const out = { outer: [] as number[], inner: [] as number[], outerN: [] as number[], innerN: [] as number[], outerUv: [] as number[], innerUv: [] as number[] }
  // normal axis, sign, tangent axes (t1 x t2 = normal)
  const FACES: [number, number, number, number][] = [[0, 1, 1, 2], [0, -1, 2, 1], [1, 1, 2, 0], [1, -1, 0, 2], [2, 1, 0, 1], [2, -1, 1, 0]]
  for (const b of boxes) {
    const c = [b.cx, b.cy, b.cz], h = [b.sx / 2, b.sy / 2, b.sz / 2]
    for (const [a, sg, t1, t2] of FACES) {
      const plane = c[a] + sg * h[a]
      const isOuter = (a === 0 && sg * plane >= outerX - 0.01) || (a === 2 && sg * plane >= outerZ - 0.01)
      const pos = isOuter ? out.outer : out.inner, nor = isOuter ? out.outerN : out.innerN, uv = isOuter ? out.outerUv : out.innerUv
      const corner = (s1: number, s2: number) => { const v = [...c]; v[a] = plane; v[t1] += s1 * h[t1]; v[t2] += s2 * h[t2]; return v }
      const quad = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = quad[k]
        pos.push(v[0], v[1], v[2])
        nor.push(a === 0 ? sg : 0, a === 1 ? sg : 0, a === 2 ? sg : 0)
        // world-anchored UVs: along the wall / up
        const u = a === 0 ? v[2] : v[0], w = a === 1 ? v[2] : v[1]
        uv.push(u / tile[0], w / tile[1])
      }
    }
  }
  const make = (p: number[], n: number[], u: number[]) => {
    if (!p.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2))
    return g
  }
  return { outer: make(out.outer, out.outerN, out.outerUv), inner: make(out.inner, out.innerN, out.innerUv) }
}

function useBoxesGeometry(boxes: Box[]) {
  const geo = useMemo(() => boxesGeometry(boxes), [boxes])
  useEffect(() => () => { geo?.dispose() }, [geo])
  return geo
}

// ---------------------------------------------------------------------------------------------------------------
// camera

const AZIMUTH = (40 * Math.PI) / 180
const ELEVATION = (36 * Math.PI) / 180

/** Frames the whole building: isometric architectural view, or straight-down plan view. Never crops walls. */
function CameraRig({ model, view, nonce, pad = 0.5 }: { model: Model3D; view: ViewMode; nonce: number; pad?: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null

  useEffect(() => {
    if (!size.width || !size.height) return
    const { length: L, width: W, totalHeight: Ht, slab } = model
    const top = view === 'top'
    const target = new THREE.Vector3(0, top ? 0 : Ht * 0.4, 0)
    const dir = top
      ? new THREE.Vector3(0, 1, 0.0001).normalize()
      : new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION))
    const corners: THREE.Vector3[] = []
    for (const x of [-L / 2 - pad, L / 2 + pad]) for (const y of [-slab, top ? 0.2 : Ht + 0.2]) for (const z of [-W / 2 - pad, W / 2 + pad]) corners.push(new THREE.Vector3(x, y, z))
    camera.aspect = size.width / size.height
    camera.updateProjectionMatrix()
    let dist = Math.max(L, W, Ht) * 2.2
    for (let i = 0; i < 8; i++) {
      camera.position.copy(target).addScaledVector(dir, dist)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      let m = 0
      for (const c of corners) { const v = c.clone().project(camera); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)) }
      dist *= Math.max(0.2, m / 0.88)
    }
    controls?.target.copy(target)
    controls?.update()
  }, [camera, controls, size.width, size.height, model.length, model.width, model.totalHeight, model.slab, view, nonce, pad]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Dollhouse cutaway: the exterior walls facing the camera are lowered so the interior stays visible. */
function CutawayTracker({ onChange }: { onChange: (sides: Side[]) => void }) {
  const state = useRef({ x: 1, z: 1 })
  const last = useRef('')
  useFrame(({ camera }) => {
    if (Math.abs(camera.position.x) > 0.5) state.current.x = Math.sign(camera.position.x)
    if (Math.abs(camera.position.z) > 0.5) state.current.z = Math.sign(camera.position.z)
    const key = `${state.current.x > 0 ? 'E' : 'W'}${state.current.z > 0 ? 'S' : 'N'}`
    if (key !== last.current) { last.current = key; onChange([key[0] as Side, key[1] as Side]) }
  })
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// floor

function floorGeometry(sx: number, sz: number, unit: number) {
  const g = new THREE.PlaneGeometry(sx, sz)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * sx) / unit, (uv.getY(i) * sz) / unit)
  return g
}

function RoomFloor({ r, mat, geo, at }: { r: RoomBox; mat: THREE.Material; geo: THREE.BufferGeometry; at?: Rect }) {
  const [cx, cz] = at ? [(at.x0 + at.x1) / 2, (at.z0 + at.z1) / 2] : [r.cx, r.cz]
  return <mesh geometry={geo} material={mat} position={[cx, r.y + 0.012, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />
}

/** Treads, landings and handrails of the stairs going up from this floor, plus guard rails around stairwells in it. */
function Stairs({ stairs, holes = [], wireframe, clipTop = null, clipBottom = null }: { stairs: Stair[]; holes?: StairHole[]; wireframe: boolean; clipTop?: number | null; clipBottom?: number | null }) {
  // floor above hidden: stop the stairs at the wall tops; floor below hidden: show only the top of the flight in the stairwell
  const clip = useMemo(() => {
    const planes: THREE.Plane[] = []
    if (clipTop != null) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), clipTop))
    if (clipBottom != null) planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -clipBottom))
    return planes.length ? planes : undefined
  }, [clipTop, clipBottom])
  const steps = useMemo(() => stairs.flatMap((s) => s.steps), [stairs])
  const posts = useMemo(() => [...stairs.flatMap((s) => s.posts), ...holes.flatMap((h) => h.guard.posts)], [stairs, holes])
  const rails = useMemo(() => [...stairs.flatMap((s) => s.rails), ...holes.flatMap((h) => h.guard.rails)], [stairs, holes])
  const stepGeo = useBoxesGeometry(steps)
  const postGeo = useBoxesGeometry(posts)
  const railGeo = useRailsGeometry(rails)
  return (
    <>
      {stepGeo && <mesh geometry={stepGeo} castShadow receiveShadow><meshStandardMaterial color={PALETTE.stair} roughness={0.8} wireframe={wireframe} clippingPlanes={clip} clipShadows /></mesh>}
      {postGeo && <mesh geometry={postGeo} castShadow><meshStandardMaterial color={PALETTE.rail} roughness={0.4} metalness={0.5} wireframe={wireframe} clippingPlanes={clip} clipShadows /></mesh>}
      {railGeo && <mesh geometry={railGeo} castShadow><meshStandardMaterial color={PALETTE.rail} roughness={0.4} metalness={0.5} wireframe={wireframe} clippingPlanes={clip} clipShadows /></mesh>}
    </>
  )
}

function DoorLeaf({ o, y, wireframe, open }: { o: Opening; y: number; wireframe: boolean; open: boolean }) {
  const hinge = o.center - o.width / 2
  const angle = open ? ((o.orientation === 'x' ? -o.into : o.into) * 75 * Math.PI) / 180 : 0
  const pos: [number, number, number] = o.orientation === 'x' ? [hinge, y, o.line] : [o.line, y, hinge]
  const size: [number, number, number] = o.orientation === 'x' ? [o.width - 0.04, o.height - 0.03, 0.04] : [0.04, o.height - 0.03, o.width - 0.04]
  const offset: [number, number, number] = o.orientation === 'x' ? [(o.width - 0.04) / 2, (o.height - 0.03) / 2, 0] : [0, (o.height - 0.03) / 2, (o.width - 0.04) / 2]
  return (
    <group position={pos} rotation={[0, angle, 0]}>
      <mesh position={offset} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={PALETTE.door} roughness={0.6} wireframe={wireframe} />
      </mesh>
    </group>
  )
}

/** Frames (doors + windows) as merged boxes, glass as one thin translucent pane per window. */
function openingParts(openings: Opening[], y: number): { frames: Box[]; glass: Box[] } {
  const frames: Box[] = [], glass: Box[] = []
  const fw = 0.05
  for (const o of openings) {
    const th = Math.min(o.thickness, 0.3) + 0.02
    const y0 = y + o.sill, y1 = y0 + o.height
    const at = (a0: number, a1: number, ya: number, yb: number, t: number): Box =>
      o.orientation === 'x'
        ? { cx: (a0 + a1) / 2, cy: (ya + yb) / 2, cz: o.line, sx: a1 - a0, sy: yb - ya, sz: t }
        : { cx: o.line, cy: (ya + yb) / 2, cz: (a0 + a1) / 2, sx: t, sy: yb - ya, sz: a1 - a0 }
    const s = o.center - o.width / 2, e = o.center + o.width / 2
    frames.push(at(s, s + fw, y0, y1, th), at(e - fw, e, y0, y1, th), at(s, e, y1 - fw, y1, th))
    if (o.kind === 'window') {
      frames.push(at(s, e, y0, y0 + fw, th))
      glass.push(at(s + fw, e - fw, y0 + fw, y1 - fw, 0.02))
    }
  }
  return { frames, glass }
}

function Floor({ f, model, opts, cut, aboveShown, belowShown, measuring = false, selectedId, selectedFurnitureId, selectedOpeningId, hoverId, onSelect, onHover, labelsOn }: {
  f: FloorModel; model: Model3D; opts: ViewerOptions; cut: Side[] | null; aboveShown: boolean; belowShown: boolean; measuring?: boolean
  selectedId: string | null; selectedFurnitureId: string | null; selectedOpeningId: string | null; hoverId: string | null; onSelect: (id: string | null) => void; onHover: (id: string | null) => void; labelsOn: boolean
}) {
  const wf = opts.wireframe
  const { slab, length: L, width: W, wallT } = model
  const tex = useMemo(() => getTextures(), [])

  const wallBoxes = useMemo(() => f.walls.flatMap((w) => (w.exterior && cut && w.side && cut.includes(w.side) ? w.cutPieces : w.pieces)), [f.walls, cut])
  const look0 = opts.look ?? DEFAULT_LOOK
  const splitWalls = look0.exterior !== 'paint' || look0.wallOut !== look0.wallIn
  const wallGeo = useBoxesGeometry(splitWalls ? [] : wallBoxes)
  const tile = look0.exterior === 'paint' ? PAINT_TILE : WALL_TEXTURE_SIZE[look0.exterior]
  const faceGeos = useMemo(() => (splitWalls ? wallFaceGeometries(wallBoxes, L / 2 + wallT / 2, W / 2 + wallT / 2, tile) : null), [splitWalls, wallBoxes, L, W, wallT, tile])
  useEffect(() => () => { faceGeos?.outer?.dispose(); faceGeos?.inner?.dispose() }, [faceGeos])
  const outerMap = look0.exterior === 'paint' ? null : getExtraTextures()[look0.exterior]
  const { frames, glass } = useMemo(() => {
    // when a side is cut away its openings are not built, so skip their frames/glass too
    const visible = f.openings.filter((o) => {
      const w = f.walls.find((x) => x.id === o.wallId)
      return !(w && w.exterior && cut && w.side && cut.includes(w.side))
    })
    return openingParts(visible, f.y)
  }, [f.openings, f.walls, f.y, cut])
  const frameGeo = useBoxesGeometry(frames)
  const glassGeo = useBoxesGeometry(glass)
  const doors = useMemo(() => f.openings.filter((o) => o.kind === 'door'), [f.openings])

  const furnitureGeos = useMemo(() => {
    const groups = new Map<string, Box[]>()
    for (const p of f.furniture) {
      const arr = groups.get(p.color) ?? []
      arr.push(p)
      groups.set(p.color, arr)
    }
    return [...groups].map(([color, boxes]) => ({ color, geo: boxesGeometry(boxes) }))
  }, [f.furniture])
  useEffect(() => () => furnitureGeos.forEach((g) => g.geo?.dispose()), [furnitureGeos])

  const look = opts.look ?? DEFAULT_LOOK
  const sunshadeBoxes = useMemo(() => (look.sunshades ? sunshades(f, look.entrance) : []), [f, look.sunshades, look.entrance])
  const finish = (type: string) => floorFinishFor(type, floorKind(type), look.floor)
  const UNIT = { tile: 0.6, wood: 1.0, concrete: 1.2, marble: 0.8, granite: 0.6 }
  const floorGeos = useMemo(() => f.rooms.flatMap((r) => {
    const unit = UNIT[finish(r.type)]
    const holes = f.holes.map((h) => h.rect)
    // rooms over a stairwell keep their floor finish only around the opening
    const cut = holes.length ? subtractRects(r, holes) : null
    if (!cut || (cut.length === 1 && cut[0].x0 === r.x0 && cut[0].x1 === r.x1 && cut[0].z0 === r.z0 && cut[0].z1 === r.z1)) return [{ id: r.id, key: r.id, at: undefined, geo: floorGeometry(r.sx, r.sz, unit) }]
    return cut.map((c, i) => ({ id: r.id, key: `${r.id}-${i}`, at: c as Rect | undefined, geo: floorGeometry(c.x1 - c.x0, c.z1 - c.z0, unit) }))
  }), [f.rooms, f.holes, look.floor]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => floorGeos.forEach((g) => g.geo.dispose()), [floorGeos])
  const slabGeo = useBoxesGeometry(useMemo(() => {
    if (!f.holes.length) return []
    const e = wallT / 2
    return subtractRects({ x0: -L / 2 - e, x1: L / 2 + e, z0: -W / 2 - e, z1: W / 2 + e }, f.holes.map((h) => h.rect))
      .map((r) => ({ cx: (r.x0 + r.x1) / 2, cy: f.slabY, cz: (r.z0 + r.z1) / 2, sx: r.x1 - r.x0, sy: slab, sz: r.z1 - r.z0 }))
  }, [f.holes, f.slabY, L, W, wallT, slab]))

  const mats = useMemo(() => ({
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.7, wireframe: wf }),
    tile: new THREE.MeshStandardMaterial({ map: tex.tile, roughness: 0.35, wireframe: wf }),
    concrete: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9, wireframe: wf }),
    // extra finishes are only created when chosen
    ...(look.floor === 'marble' ? { marble: new THREE.MeshStandardMaterial({ map: getExtraTextures().marble, roughness: 0.25, wireframe: wf }) } : {}),
    ...(look.floor === 'granite' ? { granite: new THREE.MeshStandardMaterial({ map: getExtraTextures().granite, roughness: 0.3, wireframe: wf }) } : {}),
  } as Record<string, THREE.MeshStandardMaterial>), [tex, wf, look.floor])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  return (
    <group>
      {f.holes.length ? (
        slabGeo && <mesh geometry={slabGeo} castShadow receiveShadow><meshStandardMaterial color={PALETTE.slab} roughness={0.95} wireframe={wf} /></mesh>
      ) : (
        <mesh position={[0, f.slabY, 0]} castShadow receiveShadow>
          <boxGeometry args={[L + wallT, slab, W + wallT]} />
          <meshStandardMaterial color={PALETTE.slab} roughness={0.95} wireframe={wf} />
        </mesh>
      )}

      {f.rooms.map((r) => floorGeos.filter((x) => x.id === r.id).map((g) => <RoomFloor key={g.key} r={r} at={g.at} mat={mats[finish(r.type)] ?? mats[floorKind(r.type)]} geo={g.geo} />))}
      {look.sunshades && opts.showWalls && <BoxesMesh boxes={sunshadeBoxes} color={PALETTE.slab} wireframe={wf} />}
      <Stairs stairs={f.stairs} holes={f.holes} wireframe={wf} clipTop={aboveShown ? null : f.y + model.height} />
      {!belowShown && f.index > 1 && <Stairs stairs={model.floors[f.index - 2]?.stairs ?? []} wireframe={wf} clipBottom={f.y - 1.4} />}

      {wallGeo && opts.showWalls && (
        <mesh geometry={wallGeo} castShadow receiveShadow>
          <meshStandardMaterial color={look0.wallIn} roughness={0.92} wireframe={wf} />
        </mesh>
      )}
      {faceGeos && opts.showWalls && (
        <>
          {faceGeos.inner && <mesh geometry={faceGeos.inner} castShadow receiveShadow><meshStandardMaterial color={look0.wallIn} roughness={0.92} wireframe={wf} /></mesh>}
          {faceGeos.outer && (
            <mesh geometry={faceGeos.outer} castShadow receiveShadow>
              {outerMap
                ? <meshStandardMaterial key={look0.exterior} map={outerMap} roughness={0.95} wireframe={wf} />
                : <meshStandardMaterial key="paint" color={look0.wallOut} roughness={0.92} wireframe={wf} />}
            </mesh>
          )}
        </>
      )}
      {opts.showOpenings && frameGeo && <mesh geometry={frameGeo} castShadow><meshStandardMaterial color={PALETTE.frame} roughness={0.6} wireframe={wf} /></mesh>}
      {opts.showOpenings && glassGeo && <mesh geometry={glassGeo}><meshStandardMaterial color={PALETTE.glass} transparent opacity={wf ? 1 : 0.35} roughness={0.05} metalness={0.2} depthWrite={false} wireframe={wf} /></mesh>}
      {opts.showOpenings && doors.filter((o) => {
        const w = f.walls.find((x) => x.id === o.wallId)
        return !(w && w.exterior && cut && w.side && cut.includes(w.side))
      }).map((o) => <DoorLeaf key={o.id} o={o} y={f.y} wireframe={wf} open={opts.doorsOpen} />)}
      <Highlights f={f} furnitureId={selectedFurnitureId} openingId={selectedOpeningId} />

      {opts.showFurniture && furnitureGeos.map(({ color, geo }) => geo && (
        <mesh key={color} geometry={geo} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.75} wireframe={wf} /></mesh>
      ))}

      {f.rooms.map((r: RoomBox) => {
        const sel = r.id === selectedId, hov = r.id === hoverId
        const outline: [number, number, number][] = [[r.x0, r.y + 0.05, r.z0], [r.x1, r.y + 0.05, r.z0], [r.x1, r.y + 0.05, r.z1], [r.x0, r.y + 0.05, r.z1], [r.x0, r.y + 0.05, r.z0]]
        return (
          <group key={r.id}>
            {/* invisible pick volume: clicking anywhere in the room selects it */}
            <mesh position={[r.cx, r.y + r.h / 2, r.cz]} raycast={measuring ? noRaycast : undefined}
              onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : r.id) }}
              onPointerOver={(e) => { e.stopPropagation(); onHover(r.id); document.body.style.cursor = 'pointer' }}
              onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}>
              <boxGeometry args={[Math.max(r.sx - 0.1, 0.1), r.h - 0.05, Math.max(r.sz - 0.1, 0.1)]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {(sel || hov) && (
              <mesh position={[r.cx, r.y + 0.03, r.cz]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[r.sx, r.sz]} />
                <meshBasicMaterial color={sel ? PALETTE.highlight : PALETTE.hover} transparent opacity={sel ? 0.4 : 0.18} depthWrite={false} />
              </mesh>
            )}
            {sel && <Line points={outline} color="#c2410c" lineWidth={3} />}
            {(labelsOn || sel) && (
              <Label text={r.name} sub={r.sx >= 2.6 ? `${r.area.toFixed(1)} m²` : undefined} active={sel} size={model.labelSize}
                maxWidth={r.sx * 0.92} position={[r.cx, r.y + (opts.view === 'top' ? 0.2 : 0.5), r.cz]} />
            )}
          </group>
        )
      })}
      {f.index === 1 && <Dimensions L={L} W={W} size={model.labelSize * 0.75} />}
    </group>
  )
}

/** Orange outlines around the selected furniture piece / opening (works for pieces that are merged into one mesh). */
function Highlights({ f, furnitureId, openingId }: { f: FloorModel; furnitureId: string | null; openingId: string | null }) {
  const out: React.ReactNode[] = []
  const box = (key: string, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => {
    const pts: [number, number, number][] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y1, z0]]
    out.push(<Line key={key} points={pts} color="#ea580c" lineWidth={3} />)
    out.push(<Line key={key + 'a'} points={[[x1, y0, z0], [x1, y1, z0]]} color="#ea580c" lineWidth={3} />, <Line key={key + 'b'} points={[[x1, y0, z1], [x1, y1, z1]]} color="#ea580c" lineWidth={3} />, <Line key={key + 'c'} points={[[x0, y0, z1], [x0, y1, z1]]} color="#ea580c" lineWidth={3} />)
  }
  const it = furnitureId ? f.furnitureItems.find((i) => i.id === furnitureId) : null
  if (it) {
    const r = itemRect(it)
    const parts = f.furniture.filter((p) => p.itemId === it.id)
    const top = parts.reduce((m, p) => Math.max(m, p.cy + p.sy / 2), f.y + 0.1) - f.y
    box('fi', r.x0, r.x1, r.z0, r.z1, f.y + 0.02, f.y + Math.max(top, 0.1))
  }
  const o = openingId ? f.openings.find((x) => x.id === openingId) : null
  if (o) {
    const lo = o.center - o.width / 2, hi = o.center + o.width / 2, t = o.thickness / 2 + 0.03
    if (o.orientation === 'x') box('op', lo, hi, o.line - t, o.line + t, f.y + o.sill, f.y + o.sill + o.height)
    else box('op', o.line - t, o.line + t, lo, hi, f.y + o.sill, f.y + o.sill + o.height)
  }
  return <>{out}</>
}

function Dimensions({ L, W, size }: { L: number; W: number; size: number }) {
  return (
    <>
      <Label dark text={`Length ${L} m`} position={[0, 0.05, W / 2 + 1.1 + size]} size={size} />
      <Label dark text={`Width ${W} m`} position={[L / 2 + 1.6 + size, 0.05, 0]} size={size} />
    </>
  )
}

/** Gable roof (flat ceiling slab + pitched roof). Optional: hidden in the dollhouse / plan views. */
function BoxesMesh({ boxes, color, wireframe, roughness = 0.9 }: { boxes: Box[]; color: string; wireframe: boolean; roughness?: number }) {
  const geo = useBoxesGeometry(boxes)
  return geo ? <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial color={color} roughness={roughness} wireframe={wireframe} /></mesh> : null
}

/** Entrance canopy + step, and the garden with its compound wall and path (each only when switched on). */
function Surroundings({ model, look, wireframe, showEntrance }: { model: Model3D; look: Look; wireframe: boolean; showEntrance: boolean }) {
  const ent = useMemo(() => (look.entrance ? entranceParts(model) : null), [model, look.entrance])
  const garden = useMemo(() => (look.garden ? gardenParts(model) : null), [model, look.garden])
  const big = 1e6
  const wallGeos = useMemo(() => (garden ? wallFaceGeometries(garden.walls, big, big, look.exterior === 'paint' ? PAINT_TILE : WALL_TEXTURE_SIZE[look.exterior]) : null), [garden, look.exterior])
  useEffect(() => () => { wallGeos?.inner?.dispose(); wallGeos?.outer?.dispose() }, [wallGeos])
  const map = look.exterior === 'paint' ? null : getExtraTextures()[look.exterior]
  const g = -model.slab - 0.03
  const plane = (r: { x0: number; x1: number; z0: number; z1: number }, y: number, color: string, key: string) => (
    <mesh key={key} position={[(r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
      <meshStandardMaterial color={color} roughness={1} polygonOffset polygonOffsetFactor={key === 'path' ? -2 : -1} wireframe={wireframe} />
    </mesh>
  )
  return (
    <>
      {ent && showEntrance && <BoxesMesh boxes={ent.canopy} color={PALETTE.slab} wireframe={wireframe} />}
      {ent && showEntrance && <BoxesMesh boxes={ent.step} color={PALETTE.stair} wireframe={wireframe} />}
      {garden && plane(garden.lawn, g + 0.012, PALETTE.lawn, 'lawn')}
      {garden?.path && plane(garden.path, g + 0.018, PALETTE.path, 'path')}
      {wallGeos?.inner && (
        <mesh geometry={wallGeos.inner} castShadow receiveShadow>
          {map ? <meshStandardMaterial key={look.exterior} map={map} roughness={0.95} wireframe={wireframe} /> : <meshStandardMaterial key="paint" color={look.wallOut} roughness={0.92} wireframe={wireframe} />}
        </mesh>
      )}
    </>
  )
}

/** Triangles -> geometry; each triangle is turned to face `hint` (so lighting is right on both sloped and vertical faces). */
function trianglesGeometry(tris: { p: [number, number, number][]; hint: [number, number, number] }[]) {
  const pos: number[] = []
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3()
  for (const t of tris) {
    A.set(...t.p[0]); B.set(...t.p[1]); C.set(...t.p[2])
    N.subVectors(B, A).cross(C.clone().sub(A))
    const pts = N.dot(new THREE.Vector3(...t.hint)) < 0 ? [t.p[0], t.p[2], t.p[1]] : t.p
    for (const q of pts) pos.push(...q)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Hip or single-slope roof over the footprint (+ overhang), base at y = 0, ridge / high side along the longer side. */
function pitchedGeometry(style: 'hip' | 'shed', lx: number, lz: number, h: number) {
  const alongX = lx >= lz
  const au = (alongX ? lx : lz) / 2, av = (alongX ? lz : lx) / 2
  // local (u along the long side, v across) -> world (x, y, z)
  const P = (u: number, y: number, v: number): [number, number, number] => (alongX ? [u, y, v] : [v, y, u])
  const H = (u: number, y: number, v: number): [number, number, number] => (alongX ? [u, y, v] : [v, y, u])
  const up = H(0, 1, 0)
  const tris: { p: [number, number, number][]; hint: [number, number, number] }[] = []
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], hint: [number, number, number]) => {
    tris.push({ p: [a, b, c], hint }, { p: [a, c, d], hint })
  }
  if (style === 'hip') {
    const r = Math.max(0, au - av) // ridge half-length (equal slopes on all four sides)
    quad(P(-au, 0, av), P(au, 0, av), P(r, h, 0), P(-r, h, 0), up)
    quad(P(-au, 0, -av), P(au, 0, -av), P(r, h, 0), P(-r, h, 0), up)
    tris.push({ p: [P(au, 0, av), P(au, 0, -av), P(r, h, 0)], hint: up }, { p: [P(-au, 0, av), P(-au, 0, -av), P(-r, h, 0)], hint: up })
  } else {
    // high side at -v, low side at +v
    quad(P(-au, 0, av), P(au, 0, av), P(au, h, -av), P(-au, h, -av), up)
    quad(P(-au, 0, -av), P(au, 0, -av), P(au, h, -av), P(-au, h, -av), H(0, 0, -1))
    tris.push({ p: [P(au, 0, av), P(au, 0, -av), P(au, h, -av)], hint: H(1, 0, 0) }, { p: [P(-au, 0, av), P(-au, 0, -av), P(-au, h, -av)], hint: H(-1, 0, 0) })
  }
  return trianglesGeometry(tris)
}

function Roof({ model, wireframe, roofColor = PALETTE.roof, look = DEFAULT_LOOK }: { model: Model3D; wireframe: boolean; roofColor?: string; look?: Look }) {
  if (look.roofStyle === 'flat') return <FlatRoof model={model} wireframe={wireframe} look={look} />
  if (look.roofStyle === 'hip' || look.roofStyle === 'shed') return <PitchedRoof model={model} wireframe={wireframe} roofColor={roofColor} style={look.roofStyle} />
  return <GableRoof model={model} wireframe={wireframe} roofColor={roofColor} />
}

function PitchedRoof({ model, wireframe, roofColor, style }: { model: Model3D; wireframe: boolean; roofColor: string; style: 'hip' | 'shed' }) {
  const { length: L, width: W, totalHeight, slab, roof, wallT } = model
  const o = roof.overhang
  const h = style === 'shed' ? Math.min(L, W) * 0.15 : roof.height
  const geo = useMemo(() => pitchedGeometry(style, L + 2 * o, W + 2 * o, h), [style, L, W, o, h])
  // ridge, hips and eaves as fine lines, so the slopes read clearly from every angle
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 1), [geo])
  useEffect(() => () => { geo.dispose(); edges.dispose() }, [geo, edges])
  return (
    <group>
      <mesh position={[0, model.roofY, 0]} castShadow receiveShadow>
        <boxGeometry args={[L + wallT + 2 * o, slab, W + wallT + 2 * o]} />
        <meshStandardMaterial color={PALETTE.slab} roughness={0.95} wireframe={wireframe} />
      </mesh>
      <mesh geometry={geo} position={[0, totalHeight + slab, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={roofColor} roughness={0.85} wireframe={wireframe} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edges} position={[0, totalHeight + slab + 0.005, 0]}>
        <lineBasicMaterial color="#111827" transparent opacity={0.45} />
      </lineSegments>
    </group>
  )
}

/** Flat RCC terrace: roof slab on the walls with a 1 m parapet in the outside-wall finish. */
function FlatRoof({ model, wireframe, look }: { model: Model3D; wireframe: boolean; look: Look }) {
  const { length: L, width: W, slab, wallT: t } = model
  const y0 = model.roofY + slab / 2, ph = 1.0
  const ex = L / 2 + t / 2, ez = W / 2 + t / 2
  const boxes = useMemo<Box[]>(() => [
    { cx: 0, cy: y0 + ph / 2, cz: -ez + t / 2, sx: 2 * ex, sy: ph, sz: t },
    { cx: 0, cy: y0 + ph / 2, cz: ez - t / 2, sx: 2 * ex, sy: ph, sz: t },
    { cx: -ex + t / 2, cy: y0 + ph / 2, cz: 0, sx: t, sy: ph, sz: 2 * ez - 2 * t },
    { cx: ex - t / 2, cy: y0 + ph / 2, cz: 0, sx: t, sy: ph, sz: 2 * ez - 2 * t },
  ], [ex, ez, t, y0])
  const tile = look.exterior === 'paint' ? PAINT_TILE : WALL_TEXTURE_SIZE[look.exterior]
  const geos = useMemo(() => wallFaceGeometries(boxes, ex, ez, tile), [boxes, ex, ez, tile])
  useEffect(() => () => { geos.outer?.dispose(); geos.inner?.dispose() }, [geos])
  const map = look.exterior === 'paint' ? null : getExtraTextures()[look.exterior]
  const mat = map
    ? <meshStandardMaterial key={look.exterior} map={map} roughness={0.95} wireframe={wireframe} />
    : <meshStandardMaterial key="paint" color={look.wallOut} roughness={0.92} wireframe={wireframe} />
  return (
    <group>
      <mesh position={[0, model.roofY, 0]} castShadow receiveShadow>
        <boxGeometry args={[L + t, slab, W + t]} />
        <meshStandardMaterial color={PALETTE.slab} roughness={0.95} wireframe={wireframe} />
      </mesh>
      {geos.outer && <mesh geometry={geos.outer} castShadow receiveShadow>{mat}</mesh>}
      {geos.inner && <mesh geometry={geos.inner} castShadow receiveShadow>{mat}</mesh>}
    </group>
  )
}

/** Gable roof (flat ceiling slab + pitched roof): the original roof. */
function GableRoof({ model, wireframe, roofColor = PALETTE.roof }: { model: Model3D; wireframe: boolean; roofColor?: string }) {
  const { length: L, width: W, totalHeight, slab, roof } = model
  const o = roof.overhang
  const alongX = roof.ridge === 'x'
  const base = alongX ? W + 2 * o : L + 2 * o
  const depth = alongX ? L + 2 * o : W + 2 * o
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-base / 2, 0); s.lineTo(base / 2, 0); s.lineTo(0, roof.height); s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
    g.translate(0, 0, -depth / 2)
    return g
  }, [base, depth, roof.height])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <group>
      <mesh position={[0, model.roofY, 0]} castShadow receiveShadow>
        <boxGeometry args={[L + model.wallT + 2 * o, slab, W + model.wallT + 2 * o]} />
        <meshStandardMaterial color={PALETTE.slab} roughness={0.95} wireframe={wireframe} />
      </mesh>
      <mesh geometry={geo} position={[0, totalHeight + slab, 0]} rotation={[0, alongX ? Math.PI / 2 : 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={roofColor} roughness={0.85} wireframe={wireframe} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------------------------------------------

export function BuildingViewer({ model, opts, selectedId, selectedFurnitureId = null, selectedOpeningId = null, onSelect, measure = null }: {
  model: Model3D; opts: ViewerOptions; selectedId: string | null; selectedFurnitureId?: string | null; selectedOpeningId?: string | null; onSelect: (id: string | null) => void
  /** measuring: clicks on any surface place measurement points instead of selecting rooms */
  measure?: { items: Measure3D[]; onAdd: (m: Measure3D) => void; fmt: (metres: number) => string } | null
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const measuring = !!measure
  const [mPending, setMPending] = useState<P3 | null>(null)
  const [mHover, setMHover] = useState<P3 | null>(null)
  useEffect(() => { if (!measuring) { setMPending(null); setMHover(null) } }, [measuring])
  useEffect(() => {
    if (!mPending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMPending(null) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [mPending])
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  const pick = (e: { point: THREE.Vector3 }): P3 => [r3(e.point.x), r3(e.point.y), r3(e.point.z)]
  const measureHandlers = measuring ? {
    onClick: (e: { point: THREE.Vector3; delta: number; stopPropagation: () => void }) => {
      e.stopPropagation()
      if (e.delta > 4) return // that was a drag to rotate, not a click
      const pt = pick(e)
      if (!mPending) setMPending(pt)
      else { if (dist3(mPending, pt) > 0.01) measure!.onAdd({ a: mPending, b: pt }); setMPending(null) }
    },
    onPointerMove: (e: { point: THREE.Vector3; stopPropagation: () => void }) => { e.stopPropagation(); if (mPending) setMHover(pick(e)) },
  } : {}
  const [cutSides, setCutSides] = useState<Side[]>(['E', 'S'])
  const topIndex = model.floors.length
  const visible = useMemo(() => {
    if (opts.view === 'top' && opts.floor === 'all') return model.floors.filter((f) => f.index === 1)
    if (opts.floor === 'all') return model.floors
    return model.floors.filter((f) => f.index === opts.floor)
  }, [model.floors, opts.floor, opts.view])
  const roofVisible = opts.showRoof && opts.view !== 'top' && (opts.floor === 'all' || opts.floor === topIndex)
  // The complete building is always shown, so it can be rotated and seen from every side (no walls are lowered).
  const cutaway = false
  const labelFloor = Math.max(...visible.map((f) => f.index))
  const size = Math.max(model.length, model.width, model.totalHeight)
  const shadowR = Math.hypot(model.length, model.width) * 0.75 + 2

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 35, near: 0.1, far: 3000, position: [20, 15, 20] }} onPointerMissed={() => { if (!measuring) onSelect(null) }}
      gl={{ antialias: true }} onCreated={({ gl }) => { gl.localClippingEnabled = true }} style={{ background: 'linear-gradient(#e9eff6,#f8fafc)' }}>
      <hemisphereLight args={['#ffffff', '#cfc9bf', 0.7]} />
      <ambientLight intensity={0.2} />
      <directionalLight castShadow position={[size * 0.9, size * 1.5, size * 0.6]} intensity={1.7}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
        shadow-camera-left={-shadowR} shadow-camera-right={shadowR} shadow-camera-top={shadowR} shadow-camera-bottom={-shadowR}
        shadow-camera-near={0.5} shadow-camera-far={size * 6} />
      <directionalLight position={[-size, size * 0.8, -size * 0.6]} intensity={0.35} />

      <group {...measureHandlers}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -model.slab - 0.03, 0]} receiveShadow>
        <planeGeometry args={[size * 8, size * 8]} />
        <meshStandardMaterial color={PALETTE.ground} roughness={1} />
      </mesh>
      <gridHelper args={[Math.max(60, size * 3), Math.max(60, size * 3), '#c4ccd6', '#d7dde5']} position={[0, -model.slab - 0.02, 0]} raycast={noRaycast} />

      {visible.map((f) => (
        <Floor key={f.index} f={f} model={model} opts={opts} cut={cutaway ? cutSides : null} aboveShown={visible.some((v) => v.index === f.index + 1)} belowShown={visible.some((v) => v.index === f.index - 1)} measuring={measuring} selectedId={selectedId} selectedFurnitureId={selectedFurnitureId} selectedOpeningId={selectedOpeningId} hoverId={hoverId}
          onSelect={onSelect} onHover={setHoverId} labelsOn={opts.showLabels && !roofVisible && f.index === labelFloor} />
      ))}
      {opts.look && (opts.look.entrance || opts.look.garden) && (
        <Surroundings model={model} look={opts.look} wireframe={opts.wireframe} showEntrance={visible.some((f) => f.index === 1)} />
      )}
      {roofVisible && <Roof model={model} wireframe={opts.wireframe} roofColor={opts.look?.roof} look={opts.look} />}
      </group>
      {measure && <Measurements items={measure.items} pending={mPending} hover={mHover} fmt={measure.fmt} size={model.labelSize * 0.8} />}

      <OrbitControls makeDefault enableDamping dampingFactor={0.1} minDistance={2} maxDistance={size * 10} maxPolarAngle={Math.PI / 2 - 0.02} />
      <CameraRig model={model} view={opts.view} nonce={opts.resetNonce} pad={opts.look?.garden ? GARDEN_MARGIN + 0.5 : 0.5} />
      <CutawayTracker onChange={setCutSides} />
    </Canvas>
  )
}
