begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'b1@test.local');
insert into public.profiles (user_id, pseudo) values ('00000000-0000-0000-0000-0000000000b1', 'Carla');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select is(public.cast_vote('A') ->> 'error', 'no_question', 'no bet on a day without a question');
select * from finish();
rollback;
