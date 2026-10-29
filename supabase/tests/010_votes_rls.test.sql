-- Votes are secret, written once, only for today, only through cast_vote().
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Fixtures (as postgres) -------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'a2@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'a3@test.local');

insert into public.questions (day, option_a, option_b) values
  (public.game_today() - 1, 'Hier A', 'Hier B'),
  (public.game_today(), 'Thé', 'Café'),
  (public.game_today() + 1, 'Demain A', 'Demain B');

insert into public.profiles (user_id, pseudo) values
  ('00000000-0000-0000-0000-0000000000a1', 'Alice'),
  ('00000000-0000-0000-0000-0000000000a2', 'Bob');
-- a3 has no pseudo.

insert into public.votes (user_id, day, choice) values
  ('00000000-0000-0000-0000-0000000000a2', public.game_today(), 'B'),
  ('00000000-0000-0000-0000-0000000000a2', public.game_today() - 1, 'A');

-- As Alice --------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is((select count(*)::int from public.votes where user_id = '00000000-0000-0000-0000-0000000000a2'),
  0, 'a player cannot read another player''s votes of the day');
select is((select count(*)::int from public.votes), 0, 'a player sees no votes before betting');
select is((select count(*)::int from public.daily_results where day = public.game_today()),
  0, 'no verdict exists for the current day');
select is(public.today_count(), 1, 'today_count() exposes only the number of bets');

select is(public.cast_vote('A') ->> 'ok', 'true', 'first bet of the day is accepted');
select is(public.cast_vote('B') ->> 'error', 'already_voted', 'a second bet is refused');
select is(public.cast_vote('A') ->> 'error', 'already_voted', 'even on the same side');
select is((select choice from public.votes where day = public.game_today()), 'A', 'the first bet is kept');
select is((select count(*)::int from public.votes), 1, 'a player sees exactly their own vote');
select is(public.today_count(), 2, 'today_count() counts every bet');
select is(public.cast_vote('C') ->> 'error', 'invalid_choice', 'only A or B');

select throws_ok(
  $$insert into public.votes (user_id, day, choice) values ('00000000-0000-0000-0000-0000000000a1', public.game_today() - 1, 'A')$$,
  '42501', null, 'cannot insert a vote directly, e.g. for a past day');
select throws_ok(
  $$update public.votes set choice = 'B'$$, '42501', null, 'cannot change a vote');
select throws_ok(
  $$delete from public.votes$$, '42501', null, 'cannot delete a vote');
select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'cast_vote' and p.pronargs <> 1),
  'cast_vote takes no day argument: the day is always computed by the server');

select is((select count(*)::int from public.questions where day > public.game_today()),
  0, 'future questions are hidden');
select is((select count(*)::int from public.questions), 2, 'past and current questions are visible');

select throws_ok($$insert into public.daily_results (day, count_a, count_b, majority) values (public.game_today(), 9, 0, 'A')$$,
  '42501', null, 'cannot write verdicts');
select throws_ok($$update public.player_stats set score = 999$$, '42501', null, 'cannot write stats');
select throws_ok($$insert into public.profiles (user_id, pseudo) values ('00000000-0000-0000-0000-0000000000a1', 'Hack')$$,
  '42501', null, 'cannot write profiles directly');
select throws_ok($$select private.finalize_pending()$$, '42501', null, 'cannot run the nightly job');
select throws_ok($$select * from public.rate_limits$$, '42501', null, 'rate limits are not readable');

-- As a3 (no pseudo) ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
select is(public.cast_vote('A') ->> 'error', 'no_pseudo', 'no bet without a pseudo');
select ok(
  'rate_limited' = any (select public.cast_vote('A') ->> 'error' from generate_series(1, 12)),
  'cast_vote is rate limited (10 calls per minute)');

-- As an anonymous visitor (no session) ----------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.cast_vote('A')$$, '42501', null, 'visitors without a session cannot bet');
select is((select count(*)::int from public.votes), 0, 'visitors see no votes');
select is(public.today_count(), 2, 'visitors see the bet count');

select * from finish();
rollback;
