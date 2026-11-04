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
  look text check (look is null or char_length(look) between 13 and 24),
  role text not null default 'player' check (role in ('player', 'mod', 'owner')),
  listed boolean not null default true,
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
-- fastest time with that run's title and its best medal, a job likewise (the
-- newest 1,500 kept, by the day in its id), and the name's and the look's
-- dates are the later of the two. The career (`mergeCareers` in
-- src/progress/store.ts, its rules in src/progress/lenient.ts) merges every
-- counter by the larger, every set, the days played, the quests done and the
-- days with every commission done by the union, a taken quest's and the
-- day's progress cell by cell, the later day's progress over an earlier's;
-- with the same keys, caps, clamps and code-unit order. The leaderboard's
-- scores are the larger of each.
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
  ),
  job_runs as (
    select key, value from jsonb_each(case when jsonb_typeof(a #> '{jobs,done}') = 'object' then a #> '{jobs,done}' else '{}'::jsonb end)
    union all
    select key, value from jsonb_each(case when jsonb_typeof(b #> '{jobs,done}') = 'object' then b #> '{jobs,done}' else '{}'::jsonb end)
  ),
  jobs as (
    select key,
      (array_agg(value order by (value->>'ms')::numeric, value->>'title'))[1] as fastest,
      max((value->>'medal')::int) as medal
    from job_runs
    where key ~ '^[etcr]:[0-9]{1,6}:[a-z0-9]{1,12}:[0-9]{1,6}$'
      and jsonb_typeof(value) = 'object' and jsonb_typeof(value->'ms') = 'number' and jsonb_typeof(value->'medal') = 'number'
    group by key
  ),
  kept_jobs as (
    select key, fastest, medal from jobs
    order by (substring(key from '[0-9]+$'))::int desc, key
    limit 1500
  ),
  career_count_cells as (
    select key, case when jsonb_typeof(value) = 'number' then floor(least(greatest((value)::numeric, 0), 1e12)) end as n
    from (
      select key, value from jsonb_each(case when jsonb_typeof(a #> '{career,stats,counts}') = 'object' then a #> '{career,stats,counts}' else '{}'::jsonb end)
      union all
      select key, value from jsonb_each(case when jsonb_typeof(b #> '{career,stats,counts}') = 'object' then b #> '{career,stats,counts}' else '{}'::jsonb end)
    ) all_counts
    where key ~ '^[a-z][a-z0-9-]{0,31}$'
  ),
  career_counts as (
    select key, max(n) as n from career_count_cells
    where n is not null
    group by key
    order by key collate "C"
    limit 128
  ),
  career_set_items as (
    select distinct s.key as name, x.e #>> '{}' as item
    from (
      select key, value from jsonb_each(case when jsonb_typeof(a #> '{career,stats,sets}') = 'object' then a #> '{career,stats,sets}' else '{}'::jsonb end)
      union all
      select key, value from jsonb_each(case when jsonb_typeof(b #> '{career,stats,sets}') = 'object' then b #> '{career,stats,sets}' else '{}'::jsonb end)
    ) s
    cross join lateral jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) as x(e)
    where s.key ~ '^[a-z][a-z0-9-]{0,31}$' and jsonb_typeof(x.e) = 'string' and (x.e #>> '{}') ~ '^[A-Za-z0-9_:.-]{1,40}$'
  ),
  career_set_kept as (
    select name, item
    from (
      select name, item, row_number() over (partition by name order by item collate "C") as r
      from career_set_items
    ) ranked
    where r <= 400
  ),
  career_set_names as (
    select name from (select distinct name from career_set_kept) set_names
    order by name collate "C"
    limit 16
  ),
  career_days as (
    select trunc(d) as d
    from (
      select distinct case when jsonb_typeof(e) = 'number' then (e)::numeric end as d
      from (
        select e from jsonb_array_elements(case when jsonb_typeof(a #> '{career,stats,days}') = 'array' then a #> '{career,stats,days}' else '[]'::jsonb end) as x(e)
        union all
        select e from jsonb_array_elements(case when jsonb_typeof(b #> '{career,stats,days}') = 'array' then b #> '{career,stats,days}' else '[]'::jsonb end) as y(e)
      ) all_days
    ) numbers
    where d is not null and d = trunc(d) and d between 1 and 1000000
    order by d desc
    limit 1000
  ),
  career_done as (
    select q
    from (
      select distinct e #>> '{}' as q
      from (
        select e from jsonb_array_elements(case when jsonb_typeof(a #> '{career,quests,done}') = 'array' then a #> '{career,quests,done}' else '[]'::jsonb end) as x(e)
        union all
        select e from jsonb_array_elements(case when jsonb_typeof(b #> '{career,quests,done}') = 'array' then b #> '{career,quests,done}' else '[]'::jsonb end) as y(e)
      ) all_done
      where jsonb_typeof(e) = 'string'
    ) ids
    where q ~ '^[a-z][a-z0-9-]{0,31}$'
    order by q collate "C"
    limit 128
  ),
  career_active_in as (
    select key, value from jsonb_each(case when jsonb_typeof(a #> '{career,quests,active}') = 'object' then a #> '{career,quests,active}' else '{}'::jsonb end)
    union all
    select key, value from jsonb_each(case when jsonb_typeof(b #> '{career,quests,active}') = 'object' then b #> '{career,quests,active}' else '{}'::jsonb end)
  ),
  career_active as (
    select key
    from (select distinct key from career_active_in where jsonb_typeof(value) = 'array') taken
    where key ~ '^[a-z][a-z0-9-]{0,31}$' and key not in (select q from career_done)
    order by key collate "C"
    limit 128
  ),
  career_active_cells as (
    select i.key, c.o, max(c.v) as v
    from career_active_in i
    cross join lateral (
      select o, case when jsonb_typeof(e) = 'number' then floor(least(greatest((e)::numeric, 0), 1e9)) else 0 end as v
      from jsonb_array_elements(case when jsonb_typeof(i.value) = 'array' then i.value else '[]'::jsonb end) with ordinality as x(e, o)
    ) c
    where c.o <= 8
    group by i.key, c.o
  ),
  career_today as (
    select
      case when da = trunc(da) and da between 0 and 1000000 then trunc(da) else 0 end as da,
      case when db = trunc(db) and db between 0 and 1000000 then trunc(db) else 0 end as db
    from (
      select
        case when jsonb_typeof(a #> '{career,daily,day}') = 'number' then (a #> '{career,daily,day}')::numeric end as da,
        case when jsonb_typeof(b #> '{career,daily,day}') = 'number' then (b #> '{career,daily,day}')::numeric end as db
    ) raw_days
  ),
  career_daily_cells as (
    select c.o, max(c.v) as v
    from career_today t
    cross join lateral (
      select a #> '{career,daily,progress}' as p where t.da = greatest(t.da, t.db)
      union all
      select b #> '{career,daily,progress}' where t.db = greatest(t.da, t.db)
    ) s
    cross join lateral (
      select o, case when jsonb_typeof(e) = 'number' then floor(least(greatest((e)::numeric, 0), 1e9)) else 0 end as v
      from jsonb_array_elements(case when jsonb_typeof(s.p) = 'array' then s.p else '[]'::jsonb end) with ordinality as x(e, o)
    ) c
    where c.o <= 8
    group by c.o
  ),
  career_history as (
    select trunc(d) as d
    from (
      select distinct case when jsonb_typeof(e) = 'number' then (e)::numeric end as d
      from (
        select e from jsonb_array_elements(case when jsonb_typeof(a #> '{career,daily,history}') = 'array' then a #> '{career,daily,history}' else '[]'::jsonb end) as x(e)
        union all
        select e from jsonb_array_elements(case when jsonb_typeof(b #> '{career,daily,history}') = 'array' then b #> '{career,daily,history}' else '[]'::jsonb end) as y(e)
      ) all_days
    ) numbers
    where d is not null and d = trunc(d) and d between 1 and 1000000
    order by d desc
    limit 1000
  ),
  career_longest as (
    select greatest(
      coalesce(case when jsonb_typeof(a #> '{career,daily,longest}') = 'number' then floor(least(greatest((a #> '{career,daily,longest}')::numeric, 0), 1000000)) end, 0),
      coalesce(case when jsonb_typeof(b #> '{career,daily,longest}') = 'number' then floor(least(greatest((b #> '{career,daily,longest}')::numeric, 0), 1000000)) end, 0)
    ) as n
  ),
  scores as (
    select k, greatest(
      coalesce(case when jsonb_typeof(a -> 'scores' -> k) = 'number' then floor(least(greatest((a -> 'scores' -> k)::numeric, 0), 1e9)) end, 0),
      coalesce(case when jsonb_typeof(b -> 'scores' -> k) = 'number' then floor(least(greatest((b -> 'scores' -> k)::numeric, 0), 1e9)) end, 0)
    ) as v
    from (values ('xp'), ('level'), ('countries'), ('landmarks'), ('golds'), ('reputation'), ('towns')) as score_keys(k)
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
    ),
    'jobs', jsonb_build_object(
      'done', coalesce((select jsonb_object_agg(key, jsonb_build_object('ms', fastest->'ms', 'medal', medal, 'iso', fastest->'iso', 'title', fastest->'title')) from kept_jobs), '{}'::jsonb)
    ),
    'career', jsonb_build_object(
      'version', 1,
      'stats', jsonb_build_object(
        'counts', coalesce((select jsonb_object_agg(key, n) from career_counts), '{}'::jsonb),
        'sets', coalesce((select jsonb_object_agg(sn.name, (select jsonb_agg(k.item order by k.item collate "C") from career_set_kept k where k.name = sn.name)) from career_set_names sn), '{}'::jsonb),
        'days', coalesce((select jsonb_agg(d order by d) from career_days), '[]'::jsonb)
      ),
      'quests', jsonb_build_object(
        'done', coalesce((select jsonb_agg(q order by q collate "C") from career_done), '[]'::jsonb),
        'active', coalesce((select jsonb_object_agg(ca.key, coalesce((select jsonb_agg(c.v order by c.o) from career_active_cells c where c.key = ca.key), '[]'::jsonb)) from career_active ca), '{}'::jsonb)
      ),
      'daily', jsonb_build_object(
        'day', (select greatest(da, db) from career_today),
        'progress', coalesce((select jsonb_agg(v order by o) from career_daily_cells), '[]'::jsonb),
        'history', coalesce((select jsonb_agg(d order by d) from career_history), '[]'::jsonb),
        'longest', (select n from career_longest)
      )
    ),
    'scores', (select jsonb_object_agg(k, v) from scores)
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

-- ---------------------------------------------------------------------------
-- The leaderboards: the Hall of Fame
-- ---------------------------------------------------------------------------
--
-- Six boards ranked by the scores a client works out and keeps in its
-- progress document (`progress.scores`, merged by the higher of each), and a
-- board of best times for each course (`progress.rings.courses`). A board
-- shows a rank, a name, a look code, a level and a score: never an id, and
-- nothing else of the document. Only a named player who has not hidden
-- (`listed`) is on one. The three readers are security definer, because a
-- player may read no row but their own; each returns only those columns.

-- The look code grows with what a traveller wears: up to 24 characters.
alter table public.profiles drop constraint if exists profiles_look_check;
alter table public.profiles add constraint profiles_look_check
  check (look is null or char_length(look) between 13 and 24);

-- A player may hide from the boards; everyone shows until they do.
alter table public.profiles add column if not exists listed boolean not null default true;
grant insert (listed), update (listed) on public.profiles to authenticated;

-- The boards there are, by their key in `scores`.
create or replace function public.board_known(p_board text) returns boolean
  language sql immutable set search_path = '' as $$
  select coalesce(p_board in ('xp', 'countries', 'landmarks', 'golds', 'reputation', 'towns'), false);
$$;

-- A board's score in a progress document: `scores.<board>` when it is a
-- number, as a whole number from 0 to 10^12, and 0 for anything else, so a
-- document written by hand can neither break a board nor top it with a
-- string. Immutable, for the indexes below: changing it wants a reindex.
create or replace function public.board_score(p_progress jsonb, p_board text) returns bigint
  language sql immutable parallel safe set search_path = '' as $$
  select case
    when jsonb_typeof(p_progress -> 'scores' -> p_board) = 'number'
      then least(greatest(floor((p_progress -> 'scores' ->> p_board)::numeric), 0), 1000000000000)::bigint
    else 0
  end;
$$;

-- Each board read in its order off its own index, over the players it shows.
create index if not exists profiles_board_xp on public.profiles
  (public.board_score(progress, 'xp') desc, lower(name)) where listed and name is not null;
create index if not exists profiles_board_countries on public.profiles
  (public.board_score(progress, 'countries') desc, lower(name)) where listed and name is not null;
create index if not exists profiles_board_landmarks on public.profiles
  (public.board_score(progress, 'landmarks') desc, lower(name)) where listed and name is not null;
create index if not exists profiles_board_golds on public.profiles
  (public.board_score(progress, 'golds') desc, lower(name)) where listed and name is not null;
create index if not exists profiles_board_reputation on public.profiles
  (public.board_score(progress, 'reputation') desc, lower(name)) where listed and name is not null;
create index if not exists profiles_board_towns on public.profiles
  (public.board_score(progress, 'towns') desc, lower(name)) where listed and name is not null;

-- A board from `p_offset`, `p_limit` rows of it (1 to 100): the higher score
-- first, a tie sharing its rank and listed by name. A score of 0 is on no
-- board. The score is spliced in as a literal of a known board, so the
-- query matches that board's index.
create or replace function public.leaderboard(p_board text, p_limit int default 50, p_offset int default 0)
  returns table (rank bigint, name text, look text, level int, score bigint)
  language plpgsql stable security definer set search_path = '' as $$
declare
  score_of text;
begin
  if not public.board_known(p_board) then
    raise exception 'no such board' using errcode = '22023';
  end if;
  score_of := format('public.board_score(p.progress, %L)', p_board);
  return query execute format($q$
    select (rank() over (order by %1$s desc))::bigint,
           p.name,
           coalesce(p.look, ''),
           least(public.board_score(p.progress, 'level'), 9999)::int,
           %1$s
      from public.profiles p
     where p.listed and p.name is not null and %1$s > 0
     order by %1$s desc, lower(p.name)
     limit $1 offset $2
  $q$, score_of)
  using least(greatest(coalesce(p_limit, 50), 1), 100), least(greatest(coalesce(p_offset, 0), 0), 1000000);
end;
$$;

-- Where the signed-in player stands on a board: their rank (null while they
-- are hidden, have no name or score nothing there), how many are on it,
-- their score, and whether they show on the boards at all.
create or replace function public.leaderboard_me(p_board text)
  returns table (rank bigint, total bigint, score bigint, listed boolean)
  language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  mine bigint;
  shown boolean;
  above bigint;
  everyone bigint;
  score_of text;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not public.board_known(p_board) then
    raise exception 'no such board' using errcode = '22023';
  end if;
  select public.board_score(p.progress, p_board), p.listed and p.name is not null
    into mine, shown
    from public.profiles p
   where p.id = me;
  mine := coalesce(mine, 0);
  shown := coalesce(shown, false);
  score_of := format('public.board_score(p.progress, %L)', p_board);
  execute format('select count(*) from public.profiles p where p.listed and p.name is not null and %s > 0', score_of)
    into everyone;
  if shown and mine > 0 then
    execute format('select count(*) + 1 from public.profiles p where p.listed and p.name is not null and %s > $1', score_of)
      into above using mine;
  end if;
  return query select above, everyone, mine, shown;
end;
$$;

-- A course's best times, the fastest first (`p_limit` 1 to 100), from the
-- named players who show. The id is a course's key as `src/rings/store.ts`
-- keeps it (`a:<place>`, `l:<place>`, `s:<sea>`); a time counts if it is a
-- number of ms over 0 and at most a day, and its medal 1 to 3.
create or replace function public.course_board(p_course text, p_limit int default 10)
  returns table (rank bigint, name text, look text, ms numeric, medal int)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if p_course is null or p_course !~ '^[asl]:[a-z0-9-]{1,40}$' then
    raise exception 'no such course' using errcode = '22023';
  end if;
  return query
    select (rank() over (order by best.ms))::bigint, best.name, best.look, best.ms, least(best.medal, 3)::int
      from (
        select p.name as name,
               coalesce(p.look, '') as look,
               case when jsonb_typeof(r.run -> 'ms') = 'number' then (r.run ->> 'ms')::numeric end as ms,
               case when jsonb_typeof(r.run -> 'medal') = 'number' then (r.run ->> 'medal')::numeric end as medal
          from public.profiles p
         cross join lateral (select p.progress -> 'rings' -> 'courses' -> p_course as run) r
         where p.listed and p.name is not null
      ) best
     where best.ms > 0 and best.ms <= 86400000 and best.medal in (1, 2, 3)
     order by best.ms, best.medal desc, lower(best.name)
     limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

-- The boards are anyone's to read, a standing only its player's. The score
-- is executable by a player because their own writes evaluate the indexes.
revoke all on function public.board_known(text) from public, anon, authenticated;
revoke all on function public.board_score(jsonb, text) from public, anon, authenticated;
grant execute on function public.board_score(jsonb, text) to authenticated;
revoke all on function public.leaderboard(text, int, int) from public, anon, authenticated;
grant execute on function public.leaderboard(text, int, int) to anon, authenticated;
revoke all on function public.leaderboard_me(text) from public, anon, authenticated;
grant execute on function public.leaderboard_me(text) to authenticated;
revoke all on function public.course_board(text, int) from public, anon, authenticated;
grant execute on function public.course_board(text, int) to anon, authenticated;
