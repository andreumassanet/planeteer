-- The optional accounts: one profile a signed-in player, holding the name the
-- others see, how the traveller looks, a role, and the progress a device keeps
-- (passport, rings, best times, landmarks visited) so it follows the player
-- between devices. Run once in the project's SQL editor; safe to run again.
--
-- Row-level security holds every row to its owner. A player may read, create
-- and update their own profile, but never its role: the role column is not
-- granted to them, so only the dashboard (the service role) sets `mod` or
-- `owner`. The relay reads a player's name and role with that player's own
-- token, so it needs no secret.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (name is null or (char_length(name) between 2 and 20 and name ~ '^[A-Za-z0-9 _.-]+$')),
  look text check (look is null or char_length(look) = 13),
  role text not null default 'player' check (role in ('player', 'mod', 'owner')),
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- A name is one player's, whatever its case.
create unique index if not exists profiles_name_key on public.profiles (lower(name));

alter table public.profiles enable row level security;

drop policy if exists "a player reads their own profile" on public.profiles;
create policy "a player reads their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "a player creates their own profile" on public.profiles;
create policy "a player creates their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists "a player updates their own profile" on public.profiles;
create policy "a player updates their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Nothing for anonymous visitors; the role is left out of what a player may write.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, name, look, progress) on public.profiles to authenticated;
grant update (name, look, progress) on public.profiles to authenticated;

-- `updated_at` is the server's clock, not the client's.
create or replace function public.touch_profile() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_profile();

-- The project's own automatic-RLS trigger function is no endpoint for anybody to call.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- A player deletes their own account, and with it their profile (on delete
-- cascade). Security definer, because only the owner of `auth.users` may
-- delete from it; it touches nobody's row but the caller's.
create or replace function public.delete_my_account() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- A progress document is an object and stays small: a player who has walked
-- into every built town is about 200 KB.
alter table public.profiles drop constraint if exists profiles_progress_shape;
alter table public.profiles add constraint profiles_progress_shape
  check (jsonb_typeof(progress) = 'object' and pg_column_size(progress) <= 524288);

-- Two progress documents as one, by the client's own rules (`mergeProfiles`
-- in src/account/profile.ts): a country keeps its earliest stamp, towns and
-- landmark rings are unions (the newest 20,000 towns kept), a course keeps its
-- fastest time with that run's title and its best medal, and the name's and
-- the look's dates are the later of the two.
create or replace function public.merge_progress(a jsonb, b jsonb) returns jsonb
  language sql immutable set search_path = '' as $$
  with
  stamps as (
    select distinct on (s->>'iso') s
    from (
      select jsonb_array_elements(coalesce(a #> '{passport,stamps}', '[]'::jsonb)) as s
      union all
      select jsonb_array_elements(coalesce(b #> '{passport,stamps}', '[]'::jsonb))
    ) all_stamps
    where jsonb_typeof(s) = 'object' and s ? 'iso' and s ? 'date'
    order by s->>'iso', s->>'date', s::text
  ),
  towns as (
    select t, min(o) as o
    from (
      select t, o from jsonb_array_elements_text(coalesce(a #> '{passport,towns}', '[]'::jsonb)) with ordinality as x(t, o)
      union all
      select t, o + 1000000 from jsonb_array_elements_text(coalesce(b #> '{passport,towns}', '[]'::jsonb)) with ordinality as y(t, o)
    ) all_towns
    group by t
  ),
  kept_towns as (
    select t, o from towns order by o desc limit 20000
  ),
  landmarks as (
    select distinct l
    from (
      select jsonb_array_elements_text(coalesce(a #> '{rings,landmarks}', '[]'::jsonb)) as l
      union all
      select jsonb_array_elements_text(coalesce(b #> '{rings,landmarks}', '[]'::jsonb))
    ) all_landmarks
  ),
  runs as (
    select key, value from jsonb_each(case when jsonb_typeof(a #> '{rings,courses}') = 'object' then a #> '{rings,courses}' else '{}'::jsonb end)
    union all
    select key, value from jsonb_each(case when jsonb_typeof(b #> '{rings,courses}') = 'object' then b #> '{rings,courses}' else '{}'::jsonb end)
  ),
  courses as (
    select key,
      (array_agg(value order by (value->>'ms')::numeric, value->>'title'))[1] as fastest,
      max((value->>'medal')::int) as medal
    from runs
    where jsonb_typeof(value) = 'object' and jsonb_typeof(value->'ms') = 'number' and jsonb_typeof(value->'medal') = 'number'
    group by key
  )
  select jsonb_build_object(
    'version', 1,
    'nameAt', greatest(coalesce((a->>'nameAt')::numeric, 0), coalesce((b->>'nameAt')::numeric, 0)),
    'lookAt', greatest(coalesce((a->>'lookAt')::numeric, 0), coalesce((b->>'lookAt')::numeric, 0)),
    'passport', jsonb_build_object(
      'version', 1,
      'stamps', coalesce((select jsonb_agg(s order by s->>'date', s::text) from stamps), '[]'::jsonb),
      'towns', coalesce((select jsonb_agg(t order by o) from kept_towns), '[]'::jsonb)
    ),
    'rings', jsonb_build_object(
      'landmarks', coalesce((select jsonb_agg(l order by l) from landmarks), '[]'::jsonb),
      'courses', coalesce((select jsonb_object_agg(key, jsonb_build_object('ms', fastest->'ms', 'medal', medal, 'title', fastest->'title')) from courses), '{}'::jsonb)
    )
  );
$$;

-- What a device sends, folded into the player's row in one locked step, and
-- the row as it now stands; two devices writing at once both keep what they
-- sent. The name and the look are taken only if they changed later than what
-- the row holds; a taken name fails with the unique violation, as a direct
-- write would. Security invoker: the row-level rules still hold.
create or replace function public.merge_profile(p_name text, p_look text, p_progress jsonb)
  returns table (name text, look text, role text, progress jsonb)
  language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  held public.profiles%rowtype;
  merged jsonb;
  incoming_name_at numeric := coalesce((p_progress->>'nameAt')::numeric, 0);
  incoming_look_at numeric := coalesce((p_progress->>'lookAt')::numeric, 0);
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' or pg_column_size(p_progress) > 524288 then
    raise exception 'progress is not an object of at most 512 KB' using errcode = '22023';
  end if;

  select * into held from public.profiles where id = me for update;
  if not found then
    insert into public.profiles (id, name, look, progress)
      values (me, nullif(p_name, ''), nullif(p_look, ''), public.merge_progress('{}'::jsonb, p_progress));
  else
    merged := public.merge_progress(held.progress, p_progress);
    update public.profiles set
      name = case
        when coalesce(p_name, '') = '' then held.name
        when held.name is null or incoming_name_at > coalesce((held.progress->>'nameAt')::numeric, 0) then p_name
        else held.name end,
      look = case
        when coalesce(p_look, '') = '' then held.look
        when held.look is null or incoming_look_at > coalesce((held.progress->>'lookAt')::numeric, 0) then p_look
        else held.look end,
      progress = merged
    where id = me;
  end if;

  return query select pr.name, pr.look, pr.role, pr.progress from public.profiles pr where pr.id = me;
end;
$$;

revoke all on function public.merge_progress(jsonb, jsonb) from public, anon;
grant execute on function public.merge_progress(jsonb, jsonb) to authenticated;
revoke all on function public.merge_profile(text, text, jsonb) from public, anon;
grant execute on function public.merge_profile(text, text, jsonb) to authenticated;
