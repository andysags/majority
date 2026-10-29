begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'd2@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select is(public.set_pseudo('ab') ->> 'error', 'pseudo_length', 'at least 3 characters');
select is(public.set_pseudo('abcdefghijklmnopqrstu') ->> 'error', 'pseudo_length', 'at most 20 characters');
select is(public.set_pseudo('<script>') ->> 'error', 'pseudo_chars', 'letters, digits, space, _ . - '' only');
select is(public.set_pseudo('Le Con') ->> 'error', 'pseudo_offensive', 'whole-word insult');
select is(public.set_pseudo('C0NN4RD') ->> 'error', 'pseudo_offensive', 'leetspeak and repeated letters');
select is(public.set_pseudo('Conrad') ->> 'ok', 'true', 'no false positive on a word containing "con"');
select is(public.set_pseudo('  Le   Prophète ') ->> 'pseudo', 'Le Prophète', 'trimmed, spaces collapsed, accents kept');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select is(public.set_pseudo('le prophète') ->> 'error', 'pseudo_taken', 'unique, case-insensitive');
select is(public.set_pseudo('Prophète 2') ->> 'ok', 'true', 'another pseudo is fine');
select is((select count(*)::int from public.profiles), 2, 'profiles are publicly readable');
select ok('rate_limited' = any (select public.set_pseudo('Essai ' || i) ->> 'error' from generate_series(1, 12) i),
  'set_pseudo is rate limited (10 calls per minute)');
select * from finish();
rollback;
