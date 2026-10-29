-- Majorité: scheduled jobs. pg_cron runs in UTC; Cotonou is UTC+1 all year,
-- so 23:05 UTC is 00:05 in Cotonou.

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('majorite-finalize', '5 23 * * *', $$select private.finalize_pending()$$);

-- Safety net: finalize_pending() is idempotent, so re-running it every hour
-- only does work if the 00:05 run was missed.
select cron.schedule('majorite-finalize-catchup', '35 * * * *', $$select private.finalize_pending()$$);

select cron.schedule('majorite-cleanup', '17 3 * * *', $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '30 days'
    and not exists (select 1 from public.profiles p where p.user_id = u.id);
$$);
