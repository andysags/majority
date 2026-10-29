-- Majorité: admin statistics, callable only with the secret key (service_role).
-- Today's split stays hidden even here: only the number of bets is returned
-- until the verdict.

create or replace function public.admin_daily_stats(p_from date, p_to date)
returns table (day date, players integer, count_a integer, count_b integer, majority text, new_players integer, finalized boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (select generate_series(p_from, p_to, interval '1 day')::date as day),
  newp as (
    select (p.created_at at time zone 'Africa/Porto-Novo')::date as day, count(*)::integer as n
    from public.profiles p
    where p.created_at >= (p_from::timestamp at time zone 'Africa/Porto-Novo')
      and p.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Porto-Novo')
    group by 1
  ),
  live as (
    select v.day, count(*)::integer as n from public.votes v
    where v.day between p_from and p_to
      and not exists (select 1 from public.daily_results r where r.day = v.day)
    group by 1
  )
  select d.day,
         coalesce(r.total, l.n, 0),
         r.count_a,
         r.count_b,
         r.majority,
         coalesce(np.n, 0),
         r.day is not null
  from days d
  left join public.daily_results r on r.day = d.day
  left join live l on l.day = d.day
  left join newp np on np.day = d.day
  order by d.day desc
$$;

revoke all on function public.admin_daily_stats(date, date) from public, anon, authenticated;
grant execute on function public.admin_daily_stats(date, date) to service_role;
