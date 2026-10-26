# Supabase

SQL migrations live in `migrations/`, one file per change, applied in order.

Phase 1 (accounts) needs **no tables**: Supabase Auth keeps users in its own `auth` schema.
The first migrations (profiles, projects, rooms, floor plans, materials, estimates, reports, with Row Level Security on every table
and the private `floorplans` / `reports` Storage buckets) arrive in Phase 2. They will be shown to you for review **before** anything is
applied to your project.
