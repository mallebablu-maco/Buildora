# Buildora: spec, decisions and status

Source material (read-only, outside this repo): `PreChecks/` (design PDF, 83-second screen recording of the 3D Studio) and
`Buildora-reference/` (the existing BuildWise AI code). Where the sources disagree, the **screen recording and the reference code** win
for the 3D Studio; the **PDF** wins for pages the code does not have.

## 1. Decisions

| # | Decision | Notes |
|---|---|---|
| D1 | Port the proven pure logic from the reference (geometry, generator, furniture, 2D plan, estimation), with its tests as acceptance tests. Rewrite the app shell, API, auth and storage cleanly. | Confirm the reference repo's owner is fine with reuse if it is not Hemanth's own. |
| D2 | Faithful port first. Improvements only afterwards and only with approval. | |
| D3 | The estimator keeps the reference's perimeter-based method, so quantities match the old site. Real wall lengths from the 3D model are a possible later upgrade. | Changing this changes every estimate. |
| D4 | Default tile wastage **7%** (the reference code). The design PDF's Settings mock-up shows 10%. | One constant; per-user override in Settings. Revisit when estimation lands (Phase 8). |
| D5 | Stairs stay a flat circulation room (as in the reference). Real stair geometry is an optional improvement. | |
| D6 | The 3D layout is stored as one versioned JSONB document on the project. | Proven in the reference; atomic save, easy reset. |
| D7 | Product name **Buildora** everywhere in the UI. | |
| D8 | **Supabase Auth only.** No custom login, no credential store, no JWT secret. | |
| D9 | New code lives in `buildora/`; `PreChecks/` and `Buildora-reference/` are never modified. | |
| D10 | PDF-only items (Edit rooms, Continue to estimate, See materials, perimeter and gross wall area in the room panel): the simple ones come after the core Studio works (Phase 10). The "From plan / Schematic" toggle is not planned. | |

## 2. Architecture

- **Geometry lives in the browser** as a pure TypeScript core (rooms -> walls -> openings -> validation -> furniture) that feeds the 3D view,
  the 2D plan and the estimator summary. This is what makes "plan, model, furniture and estimate share one geometry" true and keeps
  editing instant.
- **FastAPI** owns persistence, structural validation of everything the browser sends, estimation (pure Python), PDF reports, signed
  upload URLs. It never trusts client geometry beyond what it validates.
- **Supabase** owns accounts (Auth), data (PostgreSQL with Row Level Security on every table) and files (private Storage buckets).
  The browser never reads or writes tables directly.
- **Identity:** the browser signs in with Supabase Auth and sends `Authorization: Bearer <access token>` to the API. The API verifies the
  token against the project's public signing keys (ES256 for this project). `user_metadata` (name, persona) is user-editable, so it is for display only.
- **Fix over the reference:** store the full opening list and derive the estimator summary on the server (the reference used a hash
  "signature" that had to match between TypeScript and Python and silently fell back to default openings when it did not). Show a banner
  whenever an estimate uses fallback openings.

## 3. Phases and status

| Phase | Deliverable | Status |
|---|---|---|
| 0 | This spec, decisions, golden fixtures plan | Done (fixtures arrive with Phase 3 tests) |
| 1 | Skeleton, Supabase Auth end to end, Render blueprint | **Built; see section 4 for what is verified** |
| 2 | Database (profiles, projects, rooms), RLS, projects CRUD, 4-step New Project wizard, My Projects, project page | **Built and tested locally; the SQL has NOT been applied to your Supabase yet** (see section 4) |
| 3 | Studio core: geometry port + 3D viewer (Exterior/Top-down, floors, toggles, cut-away, labels, dimensions, selection) | Not started |
| 4 | Room panel, Rooms list, layout save/reset | Not started |
| 5 | 2D plan editor (doors, windows, validation panel) | Not started |
| 6 | Layout generator ("From building details", variants, fit to footprint) | Not started |
| 7 | Furniture (automatic, edit, regenerate, restore) | Not started |
| 8 | Estimation engine (pure Python port) + catalogue + prices | Not started |
| 9 | Floor plan upload, scale calibration, room detection, confirm | Not started |
| 10 | Cost analysis, comparison, optimization, PDF reports, dashboard, settings | Not started |
| 11 | Hardening: RLS tests on the real project, rate limits, load test, mobile, production deploy | Not started |

A feature is only called working when it is built **and** tested. "Seen in the video" is not "implemented".

## 4. Verified so far

**Phase 1 (accounts)**
- Backend token tests: valid token accepted; missing, malformed, expired, wrong-audience, wrong-issuer, forged-signature, unknown-key,
  no-key-id, `alg: none`, HS256-with-public-key, anon-role, no-subject and tampered tokens all rejected; key rotation; 503 (not 401) when
  auth is unconfigured; CORS; security headers; URL normalisation.
- The API loads **your project's real public signing key** and rejects forged tokens that claim its key id (checked live, read-only).
- **Hemanth signed up and logged in through the website** (confirmed by Hemanth). The Dashboard connection check was not reported.

**Phase 2 (projects), against a throw-away local PostgreSQL that has the REAL migration SQL applied**
- Backend: 100 tests in total pass (Python 3.11). Beyond Phase 1: project and room CRUD, input validation (28 bad-input cases), atomic
  room replacement, cascade delete; **two-user isolation** through the API (list, read, update, delete, rooms, foreign room ids, forged owner);
  **database-level Row Level Security** (own rows only, no update/delete/insert across users, anonymous has no access, no truncate);
  the API's queries really run as the signed-in user, and a pooled connection never carries one user's identity to the next;
  CHECK constraints; user deletion cascades; storage folder rule; the migration is safe to run twice.
- **The tests can fail:** deliberately weakening the migration (rooms policy without the project check; projects visible to everyone)
  made 1 and 6 tests fail respectively; the file was restored byte for byte.
- Frontend: 65 tests pass: form rules, the 4-step wizard (validation per step, draft save, server errors), My Projects (list, empty,
  error + retry, delete with confirmation, Escape), formatting. `tsc` clean; production build succeeds.

**NOT verified yet**
- The SQL has not been run on your Supabase project, so: the database connection through Supabase's Session pooler, `SET ROLE authenticated`
  through that pooler, Supabase's own default table privileges, and the Storage rules on the real Storage service are all untested there.
  The local test database uses stand-ins for Supabase's `auth` and `storage` parts.
- Projects pages in a real browser (no browser is available to the assistant).
- A real Supabase-issued token being accepted by `/api/me`, and the password-reset email flow.
- The Render deployment (`render.yaml` is untested).

## 5. 3D Studio checklist (acceptance list)

Status: all **Planned**. "Ref" = file in `Buildora-reference/buildwise-ai/frontend/src/` to port from. IDs match the earlier analysis.

| ID | Feature | Ref | Phase |
|---|---|---|---|
| A1 | Exterior 3D orbit view (isometric start: azimuth 40°, elevation 36°) | BuildingViewer.tsx | 3 |
| A2 | Drag rotate, scroll zoom, right-drag pan, click room to select | BuildingViewer.tsx | 3 |
| A3 | Reset camera | BuildingViewer.tsx (CameraRig) | 3 |
| A4 | Top-down plan view (floor 1 when "All floors") | BuildingViewer.tsx | 3 |
| A5 | 2D plan view (SVG) | PlanView.tsx, plan2d.ts | 5 |
| A6 | Floor selector: All floors, Floor 1..N | pages/Studio.tsx | 3 |
| A7 | Project selector in the page header | components/ProjectScope.tsx | 2 |
| B1 | Labels toggle (name + area, fitted to room, hidden when too small) | Label.tsx | 3 |
| B2 | Roof toggle (gable, off by default) | BuildingViewer.tsx | 3 |
| B3 | Walls toggle | BuildingViewer.tsx | 3 |
| B4 | Doors & windows toggle (frames, translucent glass) | BuildingViewer.tsx | 3 |
| B5 | Doors open / closed (leaf rotates 75° about the hinge) | BuildingViewer.tsx | 3 |
| B6 | Furniture toggle | BuildingViewer.tsx | 7 |
| B7 | Wireframe toggle | BuildingViewer.tsx | 3 |
| B8 | Dimension tags "Length x m" / "Width y m" | BuildingViewer.tsx | 3 |
| B9 | Cut-away: the two exterior walls facing the camera drop to 0.45 m | BuildingViewer.tsx (CutawayTracker) | 3 |
| C1 | Room selection: orange highlight + outline + orange label; hover overlay | BuildingViewer.tsx | 3 |
| C2 | Selection syncs the Room information panel and the Rooms list | pages/Studio.tsx | 4 |
| C3 | Rooms list (name, floor, area), click to select | pages/Studio.tsx | 4 |
| D1 | Room editor: L, W, H, Doors, Windows, X, Y + "Save & update model" + toast | pages/Studio.tsx (RoomEditor) | 4 |
| D2 | Building card: size, floor height, floors, wall/slab, floor area, total height, doors/windows + Edit | pages/Studio.tsx, BuildingDialog.tsx | 4 |
| D3 | Add door / Add window (click a wall in 2D), drag to move, width/height/sill, nudge 10 cm, flip swing, delete, with the reference's rules | StudioPanels.tsx, PlanView.tsx | 5 |
| D4 | Layout badge: Automatic / Custom layout saved / Unsaved changes; Save layout, Discard, Reset layout | useStudioLayout.ts | 4 |
| D5 | Schematic layout for rooms without positions + "Save this layout" | model.ts | 4 |
| E1 | From building details dialog: type, size, floors 1-10, wall height/thickness, windows few/standard/many, 7 room counts, furnish, live preview, 4 variants, errors with suggestions | LayoutGeneratorDialog.tsx, layoutGenerator.ts | 6 |
| E2 | Upload 2D plan: upload, calibrate scale, detect rooms, edit table, confirm, create | FloorPlanImportDialog.tsx; backend floorplan/processing.py | 9 |
| E3 | Fit rooms to the whole footprint | pages/Studio.tsx | 6 |
| F1 | Layout validation panel: errors/warnings/info (see codes below), clickable to select the room | StudioPanels.tsx, model.ts | 5 |
| G1 | Automatic furnishing toggle; Regenerate all; Restore automatic; Regenerate room | StudioPanels.tsx, furniture.ts | 7 |
| G2 | Furniture editing: add, move, rotate, resize, replace, delete; 26 piece types; never part of the estimate | furnitureCatalog.ts, furniture.ts | 7 |
| H1 | Walls 0.23 m, slabs 0.15 m, floor height 3 m (defaults), total height = floors x height + slabs between | model.ts | 3 |
| H2 | Real door/window openings cut into walls; shared walls merged; junctions trimmed | model.ts | 3 |
| H3 | Per-room-type floors (wood / tile / concrete), ground grid, sky gradient, soft shadows | materials.ts | 3 |
| I1 | Save layout stores openings + furniture and feeds the estimate | useStudioLayout.ts; backend estimation/layout.py | 8 |

Validation codes to keep: `outside-footprint`, `room-overlap`, `unassigned-space`, `no-entrance`, `no-door`, `door-to-void`, `unreachable`,
`no-stairs`, `opening-dropped`, `door-not-placed`, `window-not-placed`, `furniture-invalid`, `furniture-blocking`, `schematic`.

Known limitations carried over from the reference: only rooms are clickable in 3D; rectangles only (no L-shapes); no stair geometry;
PDFs cannot be calibrated or detected; room rectangles are edited in panels, not dragged.

## 6. Reference map (port, do not copy blindly)

| Reference | Becomes |
|---|---|
| `features/building-3d/model.ts` (679 lines) | `frontend/src/features/studio/geometry/` split into rooms, walls, openings, validation |
| `layoutGenerator.ts` | `studio/generator/` |
| `furniture.ts`, `furnitureCatalog.ts` | `studio/furniture/` |
| `plan2d.ts`, `PlanView.tsx` | `studio/plan2d/` |
| `BuildingViewer.tsx`, `Label.tsx`, `materials.ts` | `studio/scene/` |
| `layoutStore.ts`, `useStudioLayout.ts` | `studio/state/` (store instead of a pile of `useState`) |
| 5 test files, ~86 tests | ported first, as acceptance tests |
| `backend/app/services/estimation/*` | `backend/app/services/estimation/` (pure Python), tests ported |
| `backend/app/services/floorplan/processing.py` | same, behind an upload endpoint using Supabase Storage |

## 7. Open items

- Tile wastage default: 7% vs 10% (D4).
- Reference repo ownership (D1).
- Real stair geometry, 3D selection of furniture/openings, dragging rooms in 2D, L-shaped rooms, PDF calibration: improvements, not scheduled.
- Whether the Studio must work on phones (the design shows mobile only for Dashboard and Estimation).
