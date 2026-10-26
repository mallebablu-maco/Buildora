import { z } from 'zod'
import type { ProjectInput, RoomInput, RoomType } from './types'
import { ROOM_TYPES } from './types'

// Same limits as the API, so people see a clear message here instead of a rejected request.
const metres = (label: string, { min, max, gt }: { min?: number; max: number; gt?: boolean }) => {
  const base = z.number({ invalid_type_error: `${label}: enter a number.`, required_error: `${label}: enter a number.` })
  const lower = gt ? base.gt(0, `${label} must be greater than 0.`) : base.min(min ?? 0, `${label} must be at least ${min}.`)
  return lower.max(max, `${label} must be at most ${max}.`)
}
const whole = (label: string, min: number, max: number) =>
  z.number({ invalid_type_error: `${label}: enter a whole number.`, required_error: `${label}: enter a whole number.` })
    .int(`${label} must be a whole number.`).min(min, `${label} must be at least ${min}.`).max(max, `${label} must be at most ${max}.`)

export const detailsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a project name.').max(160, 'Use at most 160 characters.'),
  owner_name: z.string().trim().max(120, 'Use at most 120 characters.'),
  description: z.string().trim().max(2000, 'Use at most 2000 characters.'),
  building_type: z.enum(['residential', 'commercial', 'extension', 'other']),
  location: z.string().trim().max(120, 'Use at most 120 characters.'),
  floors: whole('Floors', 1, 50),
  budget: z.number({ invalid_type_error: 'Budget: enter a number.' }).gt(0, 'Budget must be more than 0.').lt(1e13, 'That budget is too large.').nullable(),
})

export const buildingSchema = z.object({
  length: metres('Length', { gt: true, max: 1000 }),
  width: metres('Width', { gt: true, max: 1000 }),
  height: metres('Floor height', { min: 2, max: 15 }),
  wall_thickness: metres('Wall thickness', { min: 0.05, max: 1 }),
  slab_thickness: metres('Slab thickness', { min: 0.05, max: 1 }),
})

const ROOM_VALUES = ROOM_TYPES.map((t) => t.value) as [RoomType, ...RoomType[]]

export const roomSchema = z.object({
  name: z.string().trim().min(1, 'Name the room.').max(80, 'Use at most 80 characters.'),
  room_type: z.enum(ROOM_VALUES),
  floor_number: whole('Floor', 1, 50),
  length: metres('Length', { gt: true, max: 1000 }),
  width: metres('Width', { gt: true, max: 1000 }),
  doors: whole('Doors', 0, 50),
  windows: whole('Windows', 0, 50),
})

export const wizardSchema = detailsSchema
  .merge(buildingSchema)
  .extend({ rooms: z.array(roomSchema).max(500, 'At most 500 rooms.') })
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
