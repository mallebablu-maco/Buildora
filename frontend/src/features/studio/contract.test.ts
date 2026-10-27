/**
 * The contract between the browser and the API. This test runs the REAL Studio code (generator, geometry, layout store) and
 * writes the exact payloads it would send to backend/tests/fixtures/studio_payloads.json. The backend test suite replays them
 * against the real API, so if either side changes its mind about the data format, a test fails.
 * Regenerate with `npm test` in frontend/ and commit the file when the Studio's data format changes on purpose.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GeneratorConfig } from './layoutGenerator'
import { makeLayout, planSignature } from './layoutStore'
import { buildModel } from './model'
import { generatedProject } from './testFixtures'

// tests run from the frontend/ folder
const OUT = resolve(process.cwd(), '../backend/tests/fixtures/studio_payloads.json')

const SCENARIOS: { name: string; cfg: Partial<GeneratorConfig> }[] = [
  { name: 'one-storey 10x8 house', cfg: {} },
  { name: 'two-storey 10x8 house', cfg: { floors: 2, counts: { bedroom: 3, living: 1, kitchen: 1, dining: 1, bathroom: 2, study: 1, store: 0 } } },
  { name: 'small 6x6 studio', cfg: { length: 6, width: 6, counts: { bedroom: 1, living: 1, kitchen: 1, dining: 0, bathroom: 1, study: 0, store: 0 } } },
  { name: 'three-storey commercial 20x12', cfg: { buildingType: 'commercial', length: 20, width: 12, floors: 3, counts: { bedroom: 0, living: 1, kitchen: 1, dining: 1, bathroom: 3, study: 6, store: 1 } } },
]

describe('Studio payloads for the API', () => {
  it('generates every scenario without errors and writes the payload fixtures', () => {
    const scenarios = SCENARIOS.map(({ name, cfg }) => {
      const { p, g, rooms } = generatedProject(cfg)
      expect(g.errors, name).toEqual([])
      const model = buildModel(p, { layout: null, autoFurnish: true })
      expect(model.ok, name).toBe(true)
      expect(model.issues.filter((i) => i.severity === 'error'), name).toEqual([])
      const signature = planSignature(p, p.rooms)
      const automatic = makeLayout({ signature, settings: { autoFurnish: true }, openings: null, furniture: null, summary: model.resolved.summary })
      const custom = makeLayout({
        signature, settings: { autoFurnish: true, furnishSeed: 1 }, openings: model.resolved.openings,
        furniture: { items: model.resolved.furniture, room_sigs: model.resolved.roomSigs }, summary: model.resolved.summary,
      })
      expect(custom.openings?.length, name).toBeGreaterThan(0)
      return {
        name,
        project: {
          name, description: '', owner_name: '', building_type: p.building_type, location: '', floors: p.floors, currency: 'INR', budget: null,
          length: p.length, width: p.width, height: p.height, wall_thickness: p.wall_thickness, slab_thickness: p.slab_thickness, built_up_area: null,
        },
        rooms: rooms.map((r) => ({
          name: r.name, room_type: r.room_type, length: r.length, width: r.width, height: r.height, floor_number: r.floor_number,
          wall_thickness: r.wall_thickness, doors: r.doors, windows: r.windows, area_override: r.area_override, pos_x: r.pos_x, pos_y: r.pos_y,
        })),
        room_ids: rooms.map((r) => r.id),
        layouts: { automatic, custom },
        counts: { openings: custom.openings?.length ?? 0, furniture: custom.furniture?.items.length ?? 0, doors: model.resolved.summary.doors.length, windows: model.resolved.summary.windows.length },
      }
    })
    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, JSON.stringify({ generated_by: 'frontend/src/features/studio/contract.test.ts', scenarios }, null, 1) + '\n')
    expect(scenarios).toHaveLength(SCENARIOS.length)
  })
})
