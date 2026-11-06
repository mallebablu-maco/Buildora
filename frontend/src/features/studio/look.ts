/**
 * Colours and finishes of the 3D model. Stored in the saved layout's `settings` (look* keys), purely visual:
 * geometry, plan and estimate never read it. Defaults reproduce the original look exactly.
 */
import { PALETTE } from './materials'

export type ExteriorFinish = 'paint' | 'brick' | 'stone'
export type RoofStyle = 'gable' | 'hip' | 'flat' | 'shed'
export type FloorFinish = 'auto' | 'wood' | 'tile' | 'marble' | 'granite' | 'concrete'

export interface Look {
  wallOut: string
  wallIn: string
  exterior: ExteriorFinish
  floor: FloorFinish
  roof: string
  roofStyle: RoofStyle
  /** exterior details (all off by default) */
  sunshades: boolean
  entrance: boolean
  garden: boolean
}

export const DEFAULT_LOOK: Look = { wallOut: PALETTE.wall, wallIn: PALETTE.wall, exterior: 'paint', floor: 'auto', roof: PALETTE.roof, roofStyle: 'gable', sunshades: false, entrance: false, garden: false }

export const WALL_COLOURS: { name: string; hex: string }[] = [
  { name: 'Off-white', hex: PALETTE.wall },
  { name: 'Ivory', hex: '#f4ead2' },
  { name: 'Sand', hex: '#e2cfa8' },
  { name: 'Peach', hex: '#f1c9a5' },
  { name: 'Terracotta', hex: '#c8794f' },
  { name: 'Sage', hex: '#b9c7a8' },
  { name: 'Sky blue', hex: '#bcd3e3' },
  { name: 'Light grey', hex: '#cfd2d6' },
  { name: 'Charcoal', hex: '#5b6068' },
]

export const ROOF_COLOURS: { name: string; hex: string }[] = [
  { name: 'Slate', hex: PALETTE.roof },
  { name: 'Clay red', hex: '#a4472f' },
  { name: 'Brown', hex: '#6e4a33' },
  { name: 'Forest green', hex: '#3f5d48' },
  { name: 'Charcoal', hex: '#33363b' },
  { name: 'Light grey', hex: '#9aa1a9' },
]

export const EXTERIOR_FINISHES: { value: ExteriorFinish; label: string }[] = [
  { value: 'paint', label: 'Paint' },
  { value: 'brick', label: 'Brick' },
  { value: 'stone', label: 'Stone' },
]

export const ROOF_STYLES: { value: RoofStyle; label: string }[] = [
  { value: 'gable', label: 'Gable' },
  { value: 'hip', label: 'Hip' },
  { value: 'flat', label: 'Flat terrace' },
  { value: 'shed', label: 'Single slope' },
]

export const FLOOR_FINISHES: { value: FloorFinish; label: string }[] = [
  { value: 'auto', label: 'Automatic (by room type)' },
  { value: 'wood', label: 'Wooden flooring' },
  { value: 'tile', label: 'Vitrified tiles' },
  { value: 'marble', label: 'Marble' },
  { value: 'granite', label: 'Granite' },
  { value: 'concrete', label: 'Polished concrete' },
]

const HEX = /^#[0-9a-f]{6}$/i
const colour = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback)
const oneOf = <T extends string>(v: unknown, list: { value: T }[], fallback: T): T => (list.some((x) => x.value === v) ? (v as T) : fallback)

/** Reads the look from saved settings; anything missing or invalid falls back to the default. */
export function readLook(settings: Record<string, unknown> | null | undefined): Look {
  const s = settings ?? {}
  return {
    wallOut: colour(s.lookWallOut, DEFAULT_LOOK.wallOut),
    wallIn: colour(s.lookWallIn, DEFAULT_LOOK.wallIn),
    exterior: oneOf(s.lookExterior, EXTERIOR_FINISHES, DEFAULT_LOOK.exterior),
    floor: oneOf(s.lookFloor, FLOOR_FINISHES, DEFAULT_LOOK.floor),
    roof: colour(s.lookRoof, DEFAULT_LOOK.roof),
    roofStyle: oneOf(s.lookRoofStyle, ROOF_STYLES, DEFAULT_LOOK.roofStyle),
    sunshades: s.lookSunshades === true,
    entrance: s.lookEntrance === true,
    garden: s.lookGarden === true,
  }
}

export function lookSettings(l: Look): Record<string, string | boolean> {
  return {
    lookWallOut: l.wallOut, lookWallIn: l.wallIn, lookExterior: l.exterior, lookFloor: l.floor, lookRoof: l.roof, lookRoofStyle: l.roofStyle,
    lookSunshades: l.sunshades, lookEntrance: l.entrance, lookGarden: l.garden,
  }
}

export const isDefaultLook = (l: Look) =>
  l.wallOut === DEFAULT_LOOK.wallOut && l.wallIn === DEFAULT_LOOK.wallIn && l.exterior === DEFAULT_LOOK.exterior && l.floor === DEFAULT_LOOK.floor && l.roof === DEFAULT_LOOK.roof && l.roofStyle === DEFAULT_LOOK.roofStyle && !l.sunshades && !l.entrance && !l.garden

const WET = new Set(['bathroom', 'kitchen', 'balcony'])
export type FloorKind = 'wood' | 'tile' | 'concrete' | 'marble' | 'granite'

/** Floor finish of a room: the automatic choice, or the chosen finish for every dry room (wet rooms keep tiles). */
export function floorFinishFor(type: string, auto: 'wood' | 'tile' | 'concrete', choice: FloorFinish): FloorKind {
  if (choice === 'auto' || WET.has(type)) return auto
  return choice
}
