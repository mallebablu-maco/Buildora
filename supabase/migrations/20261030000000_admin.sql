-- Buildora, migration 3: the Admin role (admin website) - shared catalogue upkeep and user statistics.
--
-- Safe to run more than once. Adds two columns, one helper and three read-only report functions, and adds policies.
-- It contains no DROP TABLE / DROP COLUMN / DELETE / TRUNCATE. Plain-words explanation: docs/DATABASE.md
-- Run it AFTER migrations 1 and 2.
--
-- Who is an Admin: a user whose app_metadata contains {"role": "admin"}. app_metadata can only be changed by the project owner
-- (SQL editor / service role), never by the user, and Supabase copies it into every access token. Make someone Admin with:
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'you@example.com';
-- (they must log out and in again so their token carries the new role).

-- ============================================================================ new columns
-- Hidden materials stay in the database (old estimates refer to them) but are no longer offered.
alter table public.materials add column if not exists is_hidden boolean not null default false;
-- Who last changed a shared market price (null for prices written by the system).
alter table public.material_price_records add column if not exists updated_by uuid references auth.users (id) on delete set null;

-- ============================================================================ is the caller an Admin?
create or replace function public.is_admin() returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ============================================================================ shared catalogue: Admins may maintain it
-- (Ordinary users keep the policies from migration 2: they read shared rows and write only their own.)
drop policy if exists materials_admin_insert on public.materials;
create policy materials_admin_insert on public.materials for insert to authenticated
  with check (owner_id is null and (select public.is_admin()));
drop policy if exists materials_admin_update on public.materials;
create policy materials_admin_update on public.materials for update to authenticated
  using (owner_id is null and (select public.is_admin()))
  with check (owner_id is null and (select public.is_admin()));
-- No delete policy for shared materials: Admins hide them instead, so old estimates keep their history.

drop policy if exists prices_admin_insert on public.material_price_records;
create policy prices_admin_insert on public.material_price_records for insert to authenticated
  with check (owner_id is null and (select public.is_admin())
              and exists (select 1 from public.materials m where m.id = material_id and m.owner_id is null));
drop policy if exists prices_admin_update on public.material_price_records;
create policy prices_admin_update on public.material_price_records for update to authenticated
  using (owner_id is null and (select public.is_admin()))
  with check (owner_id is null and (select public.is_admin()));

-- ============================================================================ Admin reports (read-only)
-- SECURITY DEFINER: they read auth.users, which ordinary users can never read. Each one first refuses anyone who is not an Admin.

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'homeowners',  (select count(*) from auth.users where raw_user_meta_data ->> 'persona' = 'homeowner'),
    'contractors', (select count(*) from auth.users where raw_user_meta_data ->> 'persona' = 'contractor'),
    'no_role',     (select count(*) from auth.users where coalesce(raw_user_meta_data ->> 'persona', '') not in ('homeowner', 'contractor')),
    'new_7d',      (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'new_30d',     (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7d',   (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_30d',  (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'by_provider', coalesce((select jsonb_object_agg(provider, n) from
                     (select provider, count(distinct user_id) as n from auth.identities group by provider) t), '{}'::jsonb),
    'projects',    (select count(*) from public.projects),
    'estimates',   (select count(*) from public.project_estimates),
    'reports',     (select count(*) from public.reports),
    'signups_per_day', (select jsonb_agg(jsonb_build_object('day', d::date,
                          'count', (select count(*) from auth.users u where u.created_at::date = d::date)) order by d)
                        from generate_series(current_date - 29, current_date, interval '1 day') d)
  );
end $$;

create or replace function public.admin_users() returns table (
  id uuid, email text, full_name text, persona text, providers text[],
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, is_admin boolean, projects bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', '')::text, coalesce(u.raw_user_meta_data ->> 'persona', '')::text,
           coalesce((select array_agg(distinct i.provider::text order by i.provider::text) from auth.identities i where i.user_id = u.id), '{}'::text[]),
           u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin',
           (select count(*) from public.projects p where p.owner_id = u.id)
    from auth.users u
    order by u.created_at desc
    limit 2000;
end $$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_users() to authenticated;
