-- my_state() and the leaderboards, after a few closed days.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'e1@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'e2@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'e3@test.local');
insert into public.profiles (user_id, pseudo) values
  ('00000000-0000-0000-0000-0000000000e1', 'Ama'),
  ('00000000-0000-0000-0000-0000000000e2', 'Kofi'),
  ('00000000-0000-0000-0000-0000000000e3', 'Sena');
insert into public.questions (day, option_a, option_b) values
  (public.game_today() - 2, 'A', 'B'), (public.game_today() - 1, 'A2', 'B2'), (public.game_today(), 'A3', 'B3');
insert into public.votes (user_id, day, choice) values
  ('00000000-0000-0000-0000-0000000000e1', public.game_today() - 2, 'A'),
  ('00000000-0000-0000-0000-0000000000e2', public.game_today() - 2, 'A'),
  ('00000000-0000-0000-0000-0000000000e3', public.game_today() - 2, 'B'),
  ('00000000-0000-0000-0000-0000000000e1', public.game_today() - 1, 'B'),
  ('00000000-0000-0000-0000-0000000000e2', public.game_today() - 1, 'A'),
  ('00000000-0000-0000-0000-0000000000e3', public.game_today() - 1, 'A'),
  ('00000000-0000-0000-0000-0000000000e1', public.game_today(), 'A');
select private.finalize_pending();
-- Kofi: 2 pts streak 2; Ama: 1 pt streak 0; Sena: 1 pt streak 1.

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq(
  $$select rank, pseudo, score, streak from public.leaderboard('all', 50)$$,
  $$values (1, 'Kofi'::text, 2, 2), (2, 'Sena'::text, 1, 1), (3, 'Ama'::text, 1, 0)$$,
  'general board: score, then streak');
select is((select count(*)::int from public.leaderboard('all', 2)), 2, 'limit is applied');
select throws_ok($$select * from public.leaderboard('all', 1000)$$, '22023', null, 'limit is capped');
select throws_ok($$select * from public.my_state()$$, '42501', null, 'my_state needs a session');
select throws_ok($$select * from public.admin_daily_stats(current_date, current_date)$$, '42501', null,
  'admin stats are not public');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select is(public.my_state() ->> 'pseudo', 'Ama', 'own pseudo');
select is((public.my_state() -> 'stats' ->> 'score')::int, 1, 'own score');
select is((public.my_state() ->> 'rankAll')::int, 3, 'own rank on the general board');
select is(public.my_state() -> 'votes' ->> (public.game_today())::text, 'A', 'own vote of today');
select is(public.my_state() -> 'results' ->> (public.game_today() - 1)::text, 'A', 'yesterday''s verdict');
select ok(not (public.my_state() -> 'results' ? (public.game_today())::text), 'no verdict for today');

reset role;
set local role service_role;
select results_eq(
  $$select players, count_a, count_b, finalized from public.admin_daily_stats(public.game_today() - 1, public.game_today())$$,
  $$values (1, null::int, null::int, false), (3, 2, 1, true)$$,
  'admin stats: live count for today without the split, full verdict for yesterday');
select * from finish();
rollback;
