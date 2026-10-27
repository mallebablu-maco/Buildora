import { z } from 'zod'
import type { ProjectInput, RoomInput, RoomType } from './types'
import { LIMITS as L } from '@/lib/limits'
import { ROOM_TYPES } from './types'

// Same limits as the API, so people see a clear message here instead of a rejected request.
const metres = (label: string, { min, max }: { min: number; max: number }) =>
  z.number({ invalid_type_error: `${label}: enter a number.`, required_error: `${label}: enter a number.` })
    .min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`)
const text = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`)
const whole = (label: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${label}: enter a whole number.`, required_error: `${label}: enter a whole number.` })
    .int(`${label} must be a whole number.`).min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`)

export const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a project name.').max(L.PROJECT_NAME, `Use at most ${L.PROJECT_NAME} characters.`),
  owner_name: text(L.OWNER_NAME),
  description: text(L.DESCRIPTION),
  building_type: z.enum(['residential', 'commercial', 'extension', 'other']),
  location: text(L.LOCATION),
  floors: whole('Floors', 1, L.MAX_FLOORS),
  budget: z.number({ invalid_type_error: 'Budget: enter a number.' }).gt(0, 'Budget must be more than 0.').max(L.MAX_BUDGET, `Budget must be at most ${L.MAX_BUDGET.toLocaleString('en-IN')}.`).nullable(),
})

export const buildingSchema = z.object({
  length: metres('Length', { min: L.MIN_DIM, max: L.MAX_DIM }),
  width: metres('Width', { min: L.MIN_DIM, max: L.MAX_DIM }),
  height: metres('Floor height', { min: L.MIN_HEIGHT, max: L.MAX_HEIGHT }),
  wall_thickness: metres('Wall thickness', { min: L.MIN_WALL, max: L.MAX_WALL }),
  slab_thickness: metres('Slab thickness', { min: L.MIN_SLAB, max: L.MAX_SLAB }),
})

const ROOM_VALUES = ROOM_TYPES.map((t) => t.value) as [RoomType, ...RoomType[]]

export const roomSchema = z.object({
  name: z.string().trim().min(1, 'Name the room.').max(L.ROOM_NAME, `Use at most ${L.ROOM_NAME} characters.`),
  room_type: z.enum(ROOM_VALUES),
  floor_number: whole('Floor', 1, L.MAX_FLOORS),
  length: metres('Length', { min: L.MIN_ROOM_DIM, max: L.MAX_ROOM_DIM }),
  width: metres('Width', { min: L.MIN_ROOM_DIM, max: L.MAX_ROOM_DIM }),
  doors: whole('Doors', 0, L.MAX_DOORS_PER_ROOM),
  windows: whole('Windows', 0, L.MAX_WINDOWS_PER_ROOM),
})

export const wizardSchema = detailsSchema
  .merge(buildingSchema)
  .extend({ rooms: z.array(roomSchema).max(L.MAX_ROOMS, `At most ${L.MAX_ROOMS} rooms.`) })
  .superRefine((v, ctx) => {
    v.rooms.forEach((r, i) => {
      if (r.floor_number > v.floors) ctx.addIssue({ code: 'custom', path: ['rooms', i, 'floor_number'], message: `The project has ${v.floors} floor(s).` })
    })
  })

export type WizardValues = z.infer<typeof wizardSchema>

export const DEFAULT_ROOM: WizardValues['rooms'][number] = { name: '', room_type: 'bedroom', floor_number: 1, length: 3.5, width: 3.5, doors: 1, windows: 1 }

export const defaultWizardValues = (ownerName = ''): WizardValues => ({
  name: '', owner_name: ownerName, description: '', building_type: 'residential', location: '', floors: 1, budget: null,
  length: 10, width: 8, height: 3, wall_thickness: 0.23, slab_thickness: 0.15, rooms: [],
})

/** What the API receives. Rooms take the building's floor height; currency is INR for now. */
export function toPayload(v: WizardValues): ProjectInput & { rooms: RoomInput[] } {
  const { rooms, ...project } = v
  return { ...project, currency: 'INR', rooms: rooms.map((r) => ({ ...r, height: v.height })) }
}

export const STEP_FIELDS = {
  details: ['name', 'owner_name', 'description', 'building_type', 'location', 'floors', 'budget'],
  building: ['length', 'width', 'height', 'wall_thickness', 'slab_thickness'],
  rooms: ['rooms'],
} as const
