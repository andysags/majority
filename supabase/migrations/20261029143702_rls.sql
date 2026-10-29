-- Majorité: row level security.
-- Rule of thumb: clients may only SELECT; every write goes through
-- security definer functions (cast_vote, set_pseudo) or the nightly job.

alter table public.questions enable row level security;
alter table public.profiles enable row level security;
alter table public.votes enable row level security;
alter table public.daily_results enable row level security;
alter table public.player_stats enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.banned_words enable row level security;
alter table public.rate_limits enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated;
revoke all on public.banned_words, public.rate_limits from anon, authenticated;

-- Future questions stay secret: only today and earlier are visible.
create policy "questions: public up to today"
  on public.questions for select to anon, authenticated
  using (day <= (select public.game_today()));

create policy "profiles: pseudos are public"
  on public.profiles for select to anon, authenticated
  using (true);

-- A player only ever sees their own votes. No policy for anyone else, and
-- no insert/update/delete policy at all.
create policy "votes: own rows only"
  on public.votes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "daily_results: public"
  on public.daily_results for select to anon, authenticated
  using (true);

create policy "player_stats: public"
  on public.player_stats for select to anon, authenticated
  using (true);

create policy "weekly_scores: public"
  on public.weekly_scores for select to anon, authenticated
  using (true);
