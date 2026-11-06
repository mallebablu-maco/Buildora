/** Whole-floor edits: copy one floor's rooms onto other floors, or clear a floor. Returns the full new room list. */
import type { Room, RoomInput } from '@/types'

export const toInput = (r: Room): RoomInput => ({
  name: r.name, room_type: r.room_type, length: r.length, width: r.width, height: r.height, floor_number: r.floor_number, wall_thickness: r.wall_thickness,
  doors: r.doors, windows: r.windows, area_override: r.area_override, pos_x: r.pos_x, pos_y: r.pos_y,
})

/** Rooms of `from` copied to every floor in `targets` (their own rooms are replaced); other floors untouched. */
export function copyFloor(rooms: Room[], from: number, targets: number[]): RoomInput[] {
  const t = new Set(targets.filter((f) => f !== from))
  const source = rooms.filter((r) => r.floor_number === from)
  return [
    ...rooms.filter((r) => !t.has(r.floor_number)).map(toInput),
    ...[...t].sort((a, b) => a - b).flatMap((fl) => source.map((r) => ({ ...toInput(r), floor_number: fl }))),
  ]
}

export function clearFloor(rooms: Room[], floor: number): RoomInput[] {
  return rooms.filter((r) => r.floor_number !== floor).map(toInput)
}

export interface FloorSummary { floor: number; rooms: number; area: number }

export function floorSummaries(rooms: Room[], floors: number): FloorSummary[] {
  return Array.from({ length: floors }, (_, i) => {
    const on = rooms.filter((r) => r.floor_number === i + 1)
    return { floor: i + 1, rooms: on.length, area: on.reduce((s, r) => s + r.length * r.width, 0) }
  })
}
