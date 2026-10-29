-- Nightly verdict: points, streaks, ties, idempotence.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'c2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c3@test.local'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'c4@test.local');
insert into public.profiles (user_id, pseudo) values
  ('00000000-0000-0000-0000-0000000000c1', 'Une'),
  ('00000000-0000-0000-0000-0000000000c2', 'Deux'),
  ('00000000-0000-0000-0000-0000000000c3', 'Trois'),
  ('00000000-0000-0000-0000-0000000000c4', 'Quatre');

-- D1..D5 = today-5 .. today-1; D3 has no question.
insert into public.questions (day, option_a, option_b) values
  (public.game_today() - 5, 'A1', 'B1'),
  (public.game_today() - 4, 'A2', 'B2'),
  (public.game_today() - 2, 'A4', 'B4'),
  (public.game_today() - 1, 'A5', 'B5'),
  (public.game_today(), 'A6', 'B6');

create temp table fx (u text, d int, c text);
insert into fx values
  -- D1: majority A (2-1), c4 does not bet
  ('c1', 5, 'A'), ('c2', 5, 'A'), ('c3', 5, 'B'),
  -- D2: perfect tie (2-2)
  ('c1', 4, 'B'), ('c2', 4, 'A'), ('c3', 4, 'B'), ('c4', 4, 'A'),
  -- D4: majority B (2-1)
  ('c1', 2, 'A'), ('c2', 2, 'B'), ('c3', 2, 'B'),
  -- D5: majority B (3-0), c3 does not bet
  ('c1', 1, 'B'), ('c2', 1, 'B'), ('c4', 1, 'B'),
  -- today: must never be counted
  ('c1', 0, 'A');
insert into public.votes (user_id, day, choice)
select ('00000000-0000-0000-0000-0000000000' || u)::uuid, public.game_today() - d, c from fx;

create temp view expected as
select * from (values
  -- user, score, current, best, played, correct
  ('Une',    2, 1, 1, 3, 2),
  ('Deux',   3, 3, 3, 3, 3),
  ('Trois',  1, 0, 1, 2, 1),
  ('Quatre', 1, 1, 1, 1, 1)
) as t(pseudo, score, current_streak, best_streak, played, correct);

create temp view actual as
select p.pseudo, s.score, s.current_streak, s.best_streak, s.played, s.correct
from public.player_stats s join public.profiles p using (user_id);

select is(private.finalize_pending(), 4, 'closes the 4 past days that have a question');

select results_eq(
  $$select day, count_a, count_b, total, majority from public.daily_results order by day$$,
  $$values (public.game_today() - 5, 2, 1, 3, 'A'),
           (public.game_today() - 4, 2, 2, 4, '='),
           (public.game_today() - 2, 1, 2, 3, 'B'),
           (public.game_today() - 1, 0, 3, 3, 'B')$$,
  'verdicts: counts and majority, tie is "="');

select set_eq($$select * from actual$$, $$select * from expected$$,
  'points, streaks (tie keeps it, no bet or wrong bet resets it), best streak, accuracy counters');

select is((select count(*)::int from public.daily_results where day = public.game_today()), 0,
  'the current day is never finalized');

select is(private.finalize_pending(), 0, 're-running the job does nothing');
select set_eq($$select * from actual$$, $$select * from expected$$, 'stats unchanged after a second run');
select is(private.finalize_day(public.game_today() - 5), false, 'finalize_day on a closed day is a no-op');
select set_eq($$select * from actual$$, $$select * from expected$$, 'stats unchanged after a repeated finalize_day');

select results_eq(
  $$select p.pseudo, sum(w.score)::int from public.weekly_scores w join public.profiles p using (user_id) group by 1 order by 1$$,
  $$select pseudo, score from expected where score > 0 order by 1$$,
  'weekly points add up to the total score');

select private.rebuild_player_stats();
select set_eq($$select * from actual$$, $$select * from expected$$,
  'a full rebuild from verdicts gives the same stats (incremental = from scratch)');

select throws_like($$select private.finalize_day(public.game_today())$$, '%not over yet%',
  'cannot finalize today');
select throws_like($$select private.finalize_day(public.game_today() - 3)$$, '%no question%',
  'cannot finalize a day without a question');

-- A question appearing in the past (only possible as postgres) cannot be applied out of order.
insert into public.questions (day, option_a, option_b) values (public.game_today() - 6, 'A0', 'B0');
select throws_like($$select private.finalize_day(public.game_today() - 6)$$, '%later day%',
  'days are applied in order only');

-- Through the API (service_role), the past is frozen.
set local role service_role;
select throws_like($$insert into public.questions (day, option_a, option_b) values (public.game_today() - 10, 'x', 'y')$$,
  '%question_in_past%', 'admin cannot create a question in the past');
select throws_like($$update public.questions set option_a = 'Autre' where day = public.game_today() - 1$$,
  '%question_in_past%', 'admin cannot edit a past question');
select throws_like($$update public.questions set day = public.game_today() + 30 where day = public.game_today()$$,
  '%question_day_immutable%', 'a question cannot change day');
reset role;

select results_eq(
  $$select schedule from cron.job where jobname = 'majorite-finalize'$$,
  $$values ('5 23 * * *'::text)$$,
  'the job runs at 23:05 UTC = 00:05 in Cotonou');

select * from finish();
rollback;
