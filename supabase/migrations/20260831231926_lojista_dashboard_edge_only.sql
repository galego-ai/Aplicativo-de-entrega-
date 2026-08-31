revoke all on function public.store_dashboard_metrics(uuid) from public, anon, authenticated;
grant execute on function public.store_dashboard_metrics(uuid) to service_role;

drop function if exists public.store_coupon_list(uuid);
