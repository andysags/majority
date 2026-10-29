-- Majorité: schema.
-- The game day is always computed here, in Postgres, in Africa/Porto-Novo time.

create extension if not exists unaccent with schema extensions;

create or replace function public.game_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Porto-Novo')::date
$$;

comment on function public.game_today() is 'Current game day: the calendar date in Cotonou (UTC+1). The day changes at local midnight.';

-- Questions ---------------------------------------------------------------

create table public.questions (
  id bigint generated always as identity primary key,
  day date not null unique,
  option_a text not null check (char_length(btrim(option_a)) between 1 and 80),
  option_b text not null check (char_length(btrim(option_b)) between 1 and 80),
  sponsor_name text check (char_length(btrim(sponsor_name)) between 1 and 60),
  sponsor_url text check (sponsor_url ~ '^https://[^\s]+$' and char_length(sponsor_url) <= 500),
  sponsor_logo_url text check (sponsor_logo_url ~ '^https://[^\s]+$' and char_length(sponsor_logo_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_distinct_options check (lower(btrim(option_a)) <> lower(btrim(option_b))),
  constraint questions_sponsor_needs_name check (
    (sponsor_url is null and sponsor_logo_url is null) or sponsor_name is not null
  )
);

-- Players -----------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null check (
    char_length(pseudo) between 3 and 20
    and pseudo = btrim(pseudo)
    and pseudo !~ '\s{2,}'
    and pseudo ~ '^[0-9A-Za-zÀ-ÖØ-öø-ÿ][0-9A-Za-zÀ-ÖØ-öø-ÿ _.''-]*$'
  ),
  created_at timestamptz not null default now()
);

create unique index profiles_pseudo_unique on public.profiles (lower(pseudo));
create index profiles_created_at on public.profiles (created_at);

-- Votes: one per player per day, never readable by others before or after.

create table public.votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null references public.questions (day) on update restrict on delete restrict,
  choice text not null check (choice in ('A', 'B')),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index votes_day_choice on public.votes (day, choice);

-- Verdicts: one row per closed day, written only by finalize_day().

create table public.daily_results (
  day date primary key references public.questions (day) on update restrict on delete restrict,
  count_a integer not null check (count_a >= 0),
  count_b integer not null check (count_b >= 0),
  total integer generated always as (count_a + count_b) stored,
  majority text not null check (majority in ('A', 'B', '=')),
  finalized_at timestamptz not null default now(),
  constraint daily_results_majority_matches check (
    majority = case when count_a > count_b then 'A' when count_b > count_a then 'B' else '=' end
  )
);

create table public.player_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= current_streak),
  played integer not null default 0 check (played >= 0),
  correct integer not null default 0 check (correct between 0 and played),
  updated_at timestamptz not null default now()
);

create index player_stats_ranking on public.player_stats (score desc, current_streak desc) where played > 0;

-- Weekly points (Monday to Sunday), maintained by finalize_day().
create table public.weekly_scores (
  week_start date not null check (extract(isodow from week_start) = 1),
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null check (score > 0),
  primary key (week_start, user_id)
);

create index weekly_scores_ranking on public.weekly_scores (week_start, score desc);

-- Abuse protection ---------------------------------------------------------

create table public.banned_words (
  word text primary key check (word = lower(word) and char_length(word) >= 2),
  -- exact: only matches a whole word ("con" must not block "Conrad").
  exact boolean not null default false
);

create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (user_id, action, window_start)
);

create index rate_limits_window on public.rate_limits (window_start);

insert into public.banned_words (word, exact) values
  ('con', true), ('cons', true), ('connard', false), ('connasse', false), ('conasse', false),
  ('salope', false), ('salaud', false), ('pute', true), ('putes', true), ('putain', false),
  ('encule', false), ('enculer', false), ('batard', false), ('merde', false), ('fdp', true),
  ('ntm', true), ('nique', true), ('niquer', true), ('nikmok', false), ('pd', true), ('pede', true),
  ('tapette', false), ('negre', false), ('negro', false), ('bougnoul', false), ('chienne', true),
  ('couille', false), ('couilles', false), ('bite', true), ('chatte', true), ('cul', true),
  ('nazi', true), ('hitler', false), ('petasse', false), ('abruti', true),
  ('fuck', false), ('bitch', false), ('shit', true), ('asshole', false), ('nigger', false), ('nigga', false),
  ('admin', true), ('moderateur', false), ('majorite', true);
