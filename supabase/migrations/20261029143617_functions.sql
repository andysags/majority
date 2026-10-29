-- Majorité: game functions.
-- Internal helpers live in the `private` schema, which the Data API does not expose.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Questions guard ----------------------------------------------------------
-- Through the API (admin uses service_role), a question can be created or
-- edited only for today or later, and its day can never move: votes and
-- verdicts reference it. Migrations, seeds and tests run as postgres.

create or replace function private.guard_questions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.day <> old.day then
    raise exception 'question_day_immutable' using errcode = 'P0001',
      detail = 'Le jour d''une question ne peut pas changer.';
  end if;
  if new.day < public.game_today() then
    raise exception 'question_in_past' using errcode = 'P0001',
      detail = 'Impossible de créer ou modifier une question d''un jour passé.';
  end if;
  return new;
end;
$$;

create trigger questions_guard
  before insert or update on public.questions
  for each row execute function private.guard_questions();

-- Rate limiting ----------------------------------------------------------
-- Fixed windows per player and action. Callers return an error instead of
-- raising, so the hit is committed even when the request is refused.

create or replace function private.hit_rate_limit(p_user uuid, p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  h integer;
begin
  insert into public.rate_limits as r (user_id, action, window_start, hits)
  values (p_user, p_action, w, 1)
  on conflict (user_id, action, window_start) do update set hits = r.hits + 1
  returning r.hits into h;
  return h > p_max;
end;
$$;

-- Pseudo filter ----------------------------------------------------------
-- Lowercase, strip accents, undo common leetspeak, keep letters only and
-- collapse repeated letters: "C0NNN4RD" and "connard" both become "conard".

create or replace function private.filter_form(t text)
returns text
language sql
stable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      translate(extensions.unaccent('extensions.unaccent'::regdictionary, lower(t)), '013457@$', 'oieastas'),
      '[^a-z]+', ' ', 'g'),
    '([a-z])\1+', '\1', 'g'))
$$;

create or replace function private.is_offensive(p text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.banned_words b
    cross join lateral (select private.filter_form(p) as spaced, private.filter_form(b.word) as w) f
    where case
      when b.exact then (' ' || f.spaced || ' ') like ('% ' || f.w || ' %')
      else replace(f.spaced, ' ', '') like ('%' || replace(f.w, ' ', '') || '%')
    end
  )
$$;

-- Player API ---------------------------------------------------------------
-- Errors are returned as {ok:false, error:<code>} and mapped to French
-- messages by the app.

create or replace function public.set_pseudo(p_pseudo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if private.hit_rate_limit(uid, 'pseudo', 10, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v := regexp_replace(btrim(coalesce(p_pseudo, '')), '\s+', ' ', 'g');
  if char_length(v) < 3 or char_length(v) > 20 then
    return jsonb_build_object('ok', false, 'error', 'pseudo_length');
  end if;
  if v !~ '^[0-9A-Za-zÀ-ÖØ-öø-ÿ][0-9A-Za-zÀ-ÖØ-öø-ÿ _.''-]*$' then
    return jsonb_build_object('ok', false, 'error', 'pseudo_chars');
  end if;
  if private.is_offensive(v) then
    return jsonb_build_object('ok', false, 'error', 'pseudo_offensive');
  end if;
  begin
    insert into public.profiles (user_id, pseudo) values (uid, v)
    on conflict (user_id) do update set pseudo = excluded.pseudo;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'pseudo_taken');
  end;
  return jsonb_build_object('ok', true, 'pseudo', v);
end;
$$;

create or replace function public.cast_vote(p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d date;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if private.hit_rate_limit(uid, 'vote', 10, 60) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if p_choice is null or p_choice not in ('A', 'B') then
    return jsonb_build_object('ok', false, 'error', 'invalid_choice');
  end if;
  d := public.game_today();
  if not exists (select 1 from public.questions where day = d) then
    return jsonb_build_object('ok', false, 'error', 'no_question');
  end if;
  if not exists (select 1 from public.profiles where user_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'no_pseudo');
  end if;
  insert into public.votes (user_id, day, choice) values (uid, d, p_choice)
  on conflict (user_id, day) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'already_voted');
  end if;
  return jsonb_build_object('ok', true, 'day', d, 'choice', p_choice);
end;
$$;

-- Only the number of bets of the day, never the split.
create or replace function public.today_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.votes where day = public.game_today()
$$;

-- The weekly board shows the week of the last closed day: on Monday it
-- still shows last week's final standings, until Monday's verdict.
create or replace function public.board_week_start()
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', (public.game_today() - 1)::timestamp)::date
$$;

create or replace function public.leaderboard(p_scope text, p_limit integer default 50)
returns table (rank integer, user_id uuid, pseudo text, score integer, streak integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'leaderboard: invalid limit %', p_limit using errcode = '22023';
  end if;
  if p_scope = 'all' then
    return query
      select (rank() over (order by s.score desc, s.current_streak desc))::integer,
             s.user_id, p.pseudo, s.score, s.current_streak
      from public.player_stats s
      join public.profiles p on p.user_id = s.user_id
      where s.played > 0
      order by s.score desc, s.current_streak desc, lower(p.pseudo)
      limit p_limit;
  elsif p_scope = 'week' then
    return query
      select (rank() over (order by w.score desc, coalesce(s.current_streak, 0) desc))::integer,
             w.user_id, p.pseudo, w.score, coalesce(s.current_streak, 0)
      from public.weekly_scores w
      join public.profiles p on p.user_id = w.user_id
      left join public.player_stats s on s.user_id = w.user_id
      where w.week_start = public.board_week_start()
      order by w.score desc, coalesce(s.current_streak, 0) desc, lower(p.pseudo)
      limit p_limit;
  else
    raise exception 'leaderboard: unknown scope %', p_scope using errcode = '22023';
  end if;
end;
$$;

-- Everything about the signed-in player in one round trip. Runs with the
-- caller's rights: it only reads the caller's own votes (RLS) and public tables.
create or replace function public.my_state()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
    me as (select auth.uid() as uid, public.game_today() as today, public.board_week_start() as ws),
    st as (select s.* from public.player_stats s, me where s.user_id = me.uid),
    wk as (
      select w.score, coalesce(s.current_streak, 0) as streak
      from public.weekly_scores w, me
      left join public.player_stats s on s.user_id = me.uid
      where w.week_start = me.ws and w.user_id = me.uid
    )
  select jsonb_build_object(
    'today', me.today,
    'pseudo', (select p.pseudo from public.profiles p where p.user_id = me.uid),
    'stats', (select jsonb_build_object(
        'score', st.score, 'currentStreak', st.current_streak, 'bestStreak', st.best_streak,
        'played', st.played, 'correct', st.correct) from st),
    'votes', coalesce((
        select jsonb_object_agg(v.day, v.choice) from public.votes v
        where v.user_id = me.uid and v.day between me.today - 7 and me.today), '{}'::jsonb),
    'results', coalesce((
        select jsonb_object_agg(r.day, r.majority) from public.daily_results r
        where r.day between me.today - 7 and me.today - 1), '{}'::jsonb),
    'rankAll', (
        select case when st.played > 0 then 1 + (
          select count(*)::integer from public.player_stats o
          where o.played > 0
            and (o.score > st.score or (o.score = st.score and o.current_streak > st.current_streak))
        ) end
        from st),
    'rankWeek', (
        select 1 + (
          select count(*)::integer from public.weekly_scores o
          left join public.player_stats os on os.user_id = o.user_id
          where o.week_start = me.ws
            and (o.score > wk.score or (o.score = wk.score and coalesce(os.current_streak, 0) > wk.streak))
        )
        from wk),
    'weekScore', (select wk.score from wk)
  )
  from me
$$;

-- Nightly verdict ----------------------------------------------------------

create or replace function private.apply_day(d date, maj text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.player_stats (user_id)
  select v.user_id from public.votes v where v.day = d
  on conflict (user_id) do nothing;

  with x as (
    select s.user_id, v.choice,
      case
        when v.choice is null then 0
        when maj = '=' then s.current_streak
        when v.choice = maj then s.current_streak + 1
        else 0
      end as new_streak
    from public.player_stats s
    left join public.votes v on v.user_id = s.user_id and v.day = d
  )
  update public.player_stats s set
    score = s.score + (x.choice is not null and x.choice = maj)::integer,
    correct = s.correct + (x.choice is not null and x.choice = maj)::integer,
    played = s.played + (x.choice is not null and maj <> '=')::integer,
    current_streak = x.new_streak,
    best_streak = greatest(s.best_streak, x.new_streak),
    updated_at = now()
  from x
  where x.user_id = s.user_id
    and (x.choice is not null or s.current_streak <> 0);

  if maj <> '=' then
    insert into public.weekly_scores as w (week_start, user_id, score)
    select date_trunc('week', d::timestamp)::date, v.user_id, 1
    from public.votes v where v.day = d and v.choice = maj
    on conflict (week_start, user_id) do update set score = w.score + 1;
  end if;
end;
$$;

-- Idempotent: a day is applied once, guarded by its daily_results row and a
-- transaction-level lock. Days must be closed in order (streaks depend on it).
create or replace function private.finalize_day(d date)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  a integer;
  b integer;
  maj text;
begin
  perform pg_advisory_xact_lock(hashtext('majorite.finalize'));
  if exists (select 1 from public.daily_results where day = d) then
    return false;
  end if;
  if d >= public.game_today() then
    raise exception 'finalize_day(%): the day is not over yet', d;
  end if;
  if not exists (select 1 from public.questions where day = d) then
    raise exception 'finalize_day(%): no question that day', d;
  end if;
  if exists (
    select 1 from public.questions q
    where q.day < d and not exists (select 1 from public.daily_results r where r.day = q.day)
  ) then
    raise exception 'finalize_day(%): an earlier day is not finalized yet', d;
  end if;
  if exists (select 1 from public.daily_results r where r.day > d) then
    raise exception 'finalize_day(%): a later day is already finalized', d;
  end if;

  select count(*) filter (where choice = 'A'), count(*) filter (where choice = 'B')
    into a, b
  from public.votes where day = d;
  maj := case when a > b then 'A' when b > a then 'B' else '=' end;

  insert into public.daily_results (day, count_a, count_b, majority) values (d, a, b, maj);
  perform private.apply_day(d, maj);
  return true;
end;
$$;

-- What the cron runs: closes every past day still open, oldest first.
create or replace function private.finalize_pending()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select q.day from public.questions q
    where q.day < public.game_today()
      and not exists (select 1 from public.daily_results x where x.day = q.day)
    order by q.day
  loop
    if private.finalize_day(r.day) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Repair tool and test oracle: recompute every stat from the verdicts.
create or replace function private.rebuild_player_stats()
returns void
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('majorite.finalize'));
  delete from public.weekly_scores;
  delete from public.player_stats;
  for r in select day, majority from public.daily_results order by day loop
    perform private.apply_day(r.day, r.majority);
  end loop;
end;
$$;

-- Privileges -----------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.game_today() to anon, authenticated;
grant execute on function public.board_week_start() to anon, authenticated;
grant execute on function public.today_count() to anon, authenticated;
grant execute on function public.leaderboard(text, integer) to anon, authenticated;
grant execute on function public.cast_vote(text) to authenticated;
grant execute on function public.set_pseudo(text) to authenticated;
grant execute on function public.my_state() to authenticated;
