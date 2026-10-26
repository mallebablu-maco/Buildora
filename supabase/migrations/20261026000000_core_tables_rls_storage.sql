-- Buildora, migration 1: core tables, Row Level Security, private storage buckets.
--
-- Safe to run more than once. It creates things only if they are missing and contains no DROP TABLE / DELETE / TRUNCATE.
-- Plain-words explanation: docs/DATABASE.md
--
-- Users themselves live in Supabase Auth (auth.users). Every user-owned row points at auth.users(id).
-- The browser never touches these tables directly: the API connects, switches to the `authenticated` role for the
-- signed-in user and sets that user's JWT claims, so the policies below apply to the API's own queries too.

-- ============================================================================ helper
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ============================================================================ profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- (No trigger on auth.users: that table belongs to Supabase's auth service. The API creates the profile on first use.)

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================ projects
create table if not exists public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 160),
  description     text not null default '' check (char_length(description) <= 2000),
  owner_name      text not null default '' check (char_length(owner_name) <= 120),
  building_type   text not null default 'residential' check (building_type in ('residential', 'commercial', 'extension', 'other')),
  location        text not null default '' check (char_length(location) <= 120),
  floors          integer not null default 1 check (floors between 1 and 50),
  currency        text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  budget          double precision check (budget is null or (budget > 0 and budget < 1e13)),
  -- building dimensions in metres
  length          double precision not null check (length > 0 and length <= 1000),
  width           double precision not null check (width > 0 and width <= 1000),
  height          double precision not null default 3.0 check (height > 0 and height <= 30),
  wall_thickness  double precision not null default 0.23 check (wall_thickness > 0 and wall_thickness <= 3),
  slab_thickness  double precision not null default 0.15 check (slab_thickness > 0 and slab_thickness <= 3),
  built_up_area   double precision check (built_up_area is null or built_up_area > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ix_projects_owner_updated on public.projects (owner_id, updated_at desc);

drop trigger if exists trg_projects_touch on public.projects;
create trigger trg_projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ============================================================================ rooms
create table if not exists public.project_rooms (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  room_type       text not null default 'other' check (room_type in
                    ('living', 'bedroom', 'kitchen', 'dining', 'bathroom', 'study', 'store', 'balcony', 'corridor', 'staircase', 'office', 'other')),
  length          double precision not null check (length > 0 and length <= 1000),
  width           double precision not null check (width > 0 and width <= 1000),
  height          double precision not null default 3.0 check (height > 0 and height <= 30),
  floor_number    integer not null default 1 check (floor_number between 1 and 50),
  wall_thickness  double precision check (wall_thickness is null or (wall_thickness > 0 and wall_thickness <= 3)),
  doors           integer not null default 0 check (doors between 0 and 50),
  windows         integer not null default 0 check (windows between 0 and 50),
  area_override   double precision check (area_override is null or area_override > 0),
  -- position of the room's top-left corner inside the building, in metres (null = not placed yet)
  pos_x           double precision check (pos_x is null or (pos_x >= 0 and pos_x <= 1000)),
  pos_y           double precision check (pos_y is null or (pos_y >= 0 and pos_y <= 1000)),
  created_at      timestamptz not null default now()
);
create index if not exists ix_rooms_project_floor on public.project_rooms (project_id, floor_number, created_at);
create index if not exists ix_rooms_owner on public.project_rooms (owner_id);

-- ============================================================================ Row Level Security
alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.project_rooms enable row level security;

-- Nobody who is not signed in can touch anything; signed-in users get only the privileges they need,
-- and the policies below narrow those to their own rows.
revoke all on table public.profiles, public.projects, public.project_rooms from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects, public.project_rooms to authenticated;

-- (Policies use "(select auth.uid())" so Postgres evaluates it once per statement, not once per row.)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists projects_own on public.projects;
create policy projects_own on public.projects for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- A room must belong to the user AND hang under one of the user's own projects.
drop policy if exists rooms_own on public.project_rooms;
create policy rooms_own on public.project_rooms for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

-- ============================================================================ Storage: private buckets, one folder per user
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('floorplans', 'floorplans', false, 10485760, array['image/png', 'image/jpeg', 'application/pdf']),
       ('reports',    'reports',    false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Files must live under a folder named after the user's id: "<user id>/<file>".
drop policy if exists "buildora own files" on storage.objects;
create policy "buildora own files" on storage.objects for all to authenticated
  using (bucket_id in ('floorplans', 'reports') and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('floorplans', 'reports') and (storage.foldername(name))[1] = (select auth.uid())::text);
