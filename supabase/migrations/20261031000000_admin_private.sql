-- Buildora, migration 4: move the admin report functions out of the API-exposed "public" schema.
--
-- Supabase's API (PostgREST) offers every function in "public" to signed-in users. The two admin reports already refuse
-- non-admins, but they do not need to be reachable that way at all: only Buildora's backend calls them, over its direct
-- database connection. Moving them into a "private" schema (not exposed by the API) removes that route entirely.
-- Safe to run more than once (also after re-running migration 3). No data is changed. Run it AFTER migration 3.
-- The only DROP in this file removes a duplicate copy of an admin report function; no table or data is touched.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;  -- the backend runs each request as the signed-in user

do $$
declare fn text;
begin
  foreach fn in array array['admin_overview', 'admin_users'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = fn) then
      if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = fn) then
        execute format('drop function public.%I()', fn);  -- migration 3 was run again: remove its new public copy
      else
        execute format('alter function public.%I() set schema private', fn);
      end if;
    end if;
  end loop;
end $$;

revoke all on function private.admin_overview() from public, anon;
revoke all on function private.admin_users() from public, anon;
grant execute on function private.admin_overview() to authenticated;
grant execute on function private.admin_users() to authenticated;
