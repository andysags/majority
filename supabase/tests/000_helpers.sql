-- Loaded first by `supabase test db` (files run in name order, each in its own transaction).
-- Nothing persistent here on purpose: each test file builds its own fixtures and rolls back.
begin;
select plan(1);
select has_extension('pgtap');
select * from finish();
rollback;
