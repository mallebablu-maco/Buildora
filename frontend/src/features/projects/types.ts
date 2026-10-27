export const BUILDING_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'extension', label: 'Extension' },
  { value: 'other', label: 'Other' },
] as const
export type BuildingType = (typeof BUILDING_TYPES)[number]['value']

export const ROOM_TYPES = [
  { value: 'living', label: 'Living room' }, { value: 'bedroom', label: 'Bedroom' }, { value: 'kitchen', label: 'Kitchen' },
  { value: 'dining', label: 'Dining room' }, { value: 'bathroom', label: 'Bathroom' }, { value: 'study', label: 'Study' },
  { value: 'store', label: 'Store' }, { value: 'balcony', label: 'Balcony' }, { value: 'corridor', label: 'Passage' },
  { value: 'staircase', label: 'Staircase' }, { value: 'office', label: 'Office' }, { value: 'other', label: 'Other' },
] as const
export type RoomType = (typeof ROOM_TYPES)[number]['value']

export const roomTypeLabel = (v: string) => ROOM_TYPES.find((t) => t.value === v)?.label ?? v
export const buildingTypeLabel = (v: string) => BUILDING_TYPES.find((t) => t.value === v)?.label ?? v

export interface RoomInput {
  name: string
  room_type: RoomType
  length: number
  width: number
  height: number
  floor_number: number
  wall_thickness?: number | null
  doors: number
  windows: number
  area_override?: number | null
  pos_x?: number | null
  pos_y?: number | null
}

/** Stored shapes come from the API types, so every screen agrees on them. */
export type { Project, ProjectDetail, Room } from '@/types'

export interface ProjectInput {
  name: string
  description: string
  owner_name: string
  building_type: BuildingType
  location: string
  floors: number
  currency: string
  budget: number | null
  length: number
  width: number
  height: number
  wall_thickness: number
  slab_thickness: number
}
