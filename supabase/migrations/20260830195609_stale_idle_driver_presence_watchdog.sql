create or replace function private.mark_stale_idle_drivers_offline(p_stale_after interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer := 0;
begin
  update public.drivers d
     set online = false
   where d.online = true
     and d.status = 'ACTIVE'
     and exists (
       select 1
         from public.driver_locations dl
        where dl.driver_id = d.id
          and dl.recorded_at <= now() - p_stale_after
     )
     and not exists (
       select 1
         from public.deliveries x
        where x.driver_id = d.id
          and x.status not in ('DELIVERED','DELIVERY_CANCELLED')
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.mark_stale_idle_drivers_offline(interval) from public, anon, authenticated;
grant execute on function private.mark_stale_idle_drivers_offline(interval) to service_role;

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='clickfood-stale-idle-drivers-offline' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('clickfood-stale-idle-drivers-offline','*/5 * * * *', 'select private.mark_stale_idle_drivers_offline(interval ''10 minutes'');');
end $$;
