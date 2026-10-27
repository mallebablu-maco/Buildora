-- Buildora, migration 2: everything the Studio, estimates, catalogue, prices and reports need.
--
-- Safe to run more than once. It only ADDS columns and tables (or replaces this project's own policies with identical ones).
-- It contains no DROP TABLE / DROP COLUMN / DELETE / TRUNCATE. Plain-words explanation: docs/DATABASE.md
-- Run it AFTER migration 1 (20261026000000_core_tables_rls_storage.sql).

-- ============================================================================ new columns on existing tables
-- The saved 3D/2D layout (door and window positions, furniture) and the estimate settings of one project.
alter table public.projects add column if not exists is_demo             boolean not null default false;
alter table public.projects add column if not exists layout              jsonb;
alter table public.projects add column if not exists assumptions         jsonb not null default '{}';
alter table public.projects add column if not exists wastage             jsonb not null default '{}';
alter table public.projects add column if not exists material_selections jsonb not null default '{}';
alter table public.projects add column if not exists extra_costs         jsonb not null default '{}';
alter table public.projects add column if not exists purchase_quantities jsonb not null default '{}';

-- Personal defaults (Settings page).
alter table public.profiles add column if not exists default_city    text  not null default '' check (char_length(default_city) <= 120);
alter table public.profiles add column if not exists default_wastage jsonb not null default '{}';

-- ============================================================================ floor plan files (the files themselves live in Storage)
create table if not exists public.floor_plan_files (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  original_name   text not null check (char_length(original_name) <= 255),
  content_type    text not null check (content_type in ('image/png', 'image/jpeg', 'application/pdf')),
  size_bytes      integer not null check (size_bytes >= 0),
  storage_key     text not null check (char_length(storage_key) <= 255),
  width_px        integer check (width_px is null or width_px > 0),
  height_px       integer check (height_px is null or height_px > 0),
  scale_m_per_px  double precision check (scale_m_per_px is null or scale_m_per_px > 0),
  calibration     jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists ix_floorplans_project on public.floor_plan_files (project_id);
create index if not exists ix_floorplans_owner on public.floor_plan_files (owner_id);

-- ============================================================================ materials and prices
-- owner_id NULL = shared sample catalogue (read-only for everyone); otherwise private to its owner.
create table if not exists public.materials (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users (id) on delete cascade,
  estimate_key      text not null check (char_length(estimate_key) between 1 and 30),
  name              text not null check (char_length(btrim(name)) between 1 and 160),
  category          text not null check (char_length(category) between 1 and 80),
  brand             text not null default '' check (char_length(brand) <= 120),
  grade             text not null default '' check (char_length(grade) <= 120),
  specification     text not null default '' check (char_length(specification) <= 2000),
  durability_notes  text not null default '' check (char_length(durability_notes) <= 2000),
  unit              text not null check (char_length(unit) between 1 and 30),
  is_sample         boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists ix_materials_owner on public.materials (owner_id);
create index if not exists ix_materials_key on public.materials (estimate_key);

create table if not exists public.material_price_records (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.materials (id) on delete cascade,
  owner_id     uuid references auth.users (id) on delete cascade,
  unit_price   double precision not null check (unit_price >= 0 and unit_price < 1e12),
  currency     text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  supplier     text not null default '' check (char_length(supplier) <= 160),
  location     text not null default '' check (char_length(location) <= 160),
  is_sample    boolean not null default false,
  updated_at   timestamptz not null default now()
);
create index if not exists ix_prices_material on public.material_price_records (material_id);
create index if not exists ix_prices_owner on public.material_price_records (owner_id);

drop trigger if exists trg_prices_touch on public.material_price_records;
create trigger trg_prices_touch before update on public.material_price_records
  for each row execute function public.touch_updated_at();

-- ============================================================================ estimates, recommendations, reports
create table if not exists public.project_estimates (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.projects (id) on delete cascade,
  owner_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  summary              jsonb not null default '{}',
  geometry             jsonb not null default '{}',
  assumptions          jsonb not null default '{}',
  warnings             jsonb not null default '[]',
  total_material_cost  double precision not null default 0,
  total_area_sqm       double precision not null default 0,
  currency             text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  created_at           timestamptz not null default now()
);
create index if not exists ix_estimates_project_created on public.project_estimates (project_id, created_at desc);
create index if not exists ix_estimates_owner on public.project_estimates (owner_id);

create table if not exists public.estimate_items (
  id           uuid primary key default gen_random_uuid(),
  estimate_id  uuid not null references public.project_estimates (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position     integer not null default 0,
  data         jsonb not null
);
create index if not exists ix_estimate_items_pos on public.estimate_items (estimate_id, position);
create index if not exists ix_estimate_items_owner on public.estimate_items (owner_id);

create table if not exists public.optimization_recommendations (
  id           uuid primary key default gen_random_uuid(),
  estimate_id  uuid not null references public.project_estimates (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position     integer not null default 0,
  data         jsonb not null
);
create index if not exists ix_recs_pos on public.optimization_recommendations (estimate_id, position);
create index if not exists ix_recs_owner on public.optimization_recommendations (owner_id);

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  estimate_id  uuid references public.project_estimates (id) on delete set null,
  file_name    text not null check (char_length(file_name) <= 255),
  storage_key  text not null check (char_length(storage_key) <= 255),
  size_bytes   integer not null default 0 check (size_bytes >= 0),
  total_cost   double precision not null default 0,
  currency     text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  created_at   timestamptz not null default now()
);
create index if not exists ix_reports_owner_created on public.reports (owner_id, created_at desc);
create index if not exists ix_reports_project on public.reports (project_id);
create index if not exists ix_reports_estimate on public.reports (estimate_id);

-- ============================================================================ Row Level Security
alter table public.floor_plan_files             enable row level security;
alter table public.materials                    enable row level security;
alter table public.material_price_records       enable row level security;
alter table public.project_estimates            enable row level security;
alter table public.estimate_items               enable row level security;
alter table public.optimization_recommendations enable row level security;
alter table public.reports                      enable row level security;

revoke all on table public.floor_plan_files, public.materials, public.material_price_records, public.project_estimates,
  public.estimate_items, public.optimization_recommendations, public.reports from anon, authenticated;
grant select, insert, update, delete on public.floor_plan_files, public.materials, public.material_price_records,
  public.project_estimates, public.estimate_items, public.optimization_recommendations, public.reports to authenticated;

-- Rows that hang under a project/estimate: the user must own the row AND the project/estimate it hangs under.
drop policy if exists floorplans_own on public.floor_plan_files;
create policy floorplans_own on public.floor_plan_files for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists estimates_own on public.project_estimates;
create policy estimates_own on public.project_estimates for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

drop policy if exists items_own on public.estimate_items;
create policy items_own on public.estimate_items for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.project_estimates e where e.id = estimate_id and e.owner_id = (select auth.uid())));

drop policy if exists recs_own on public.optimization_recommendations;
create policy recs_own on public.optimization_recommendations for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.project_estimates e where e.id = estimate_id and e.owner_id = (select auth.uid())));

drop policy if exists reports_own on public.reports;
create policy reports_own on public.reports for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- Catalogue: shared sample rows (owner_id is null) can be read by everyone signed in but never changed; a user's own rows are private.
-- (One policy per action, so a read does not evaluate two overlapping policies.)
drop policy if exists materials_read on public.materials;
create policy materials_read on public.materials for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
drop policy if exists materials_insert on public.materials;
create policy materials_insert on public.materials for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists materials_update on public.materials;
create policy materials_update on public.materials for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists materials_delete on public.materials;
create policy materials_delete on public.materials for delete to authenticated
  using (owner_id = (select auth.uid()));

-- A price record belongs to a material that is either shared or the user's own; users may add their own price for a shared material.
drop policy if exists prices_read on public.material_price_records;
create policy prices_read on public.material_price_records for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
drop policy if exists prices_insert on public.material_price_records;
create policy prices_insert on public.material_price_records for insert to authenticated
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.materials m where m.id = material_id and (m.owner_id is null or m.owner_id = (select auth.uid()))));
drop policy if exists prices_update on public.material_price_records;
create policy prices_update on public.material_price_records for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
              and exists (select 1 from public.materials m where m.id = material_id and (m.owner_id is null or m.owner_id = (select auth.uid()))));
drop policy if exists prices_delete on public.material_price_records;
create policy prices_delete on public.material_price_records for delete to authenticated
  using (owner_id = (select auth.uid()));
