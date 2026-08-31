create or replace function private.notify_stale_cash_sessions()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_stale bigint := 0;
  v_sent integer := 0;
begin
  select count(*) into v_stale
  from public.cash_sessions cs
  where cs.status='OPEN'
    and cs.opened_at < now() - interval '24 hours';

  with stale as (
    select cs.id as cash_session_id, cs.store_id, cs.opened_at, coalesce(s.name,'Loja') as store_name
    from public.cash_sessions cs
    join public.stores s on s.id=cs.store_id
    where cs.status='OPEN'
      and cs.opened_at < now() - interval '24 hours'
  ), recipients as (
    select st.cash_session_id,st.store_id,st.opened_at,st.store_name,sm.user_id
    from stale st
    join public.store_memberships sm on sm.store_id=st.store_id
    where sm.active=true and sm.role in ('OWNER','MANAGER')
    union
    select st.cash_session_id,st.store_id,st.opened_at,st.store_name,u.id
    from stale st
    cross join auth.users u
    where coalesce(u.raw_app_meta_data->>'clickfood_role','') in ('SUPER_ADMIN','ADMIN','SUPPORT')
  ), eligible as (
    select r.*
    from recipients r
    where not exists (
      select 1
      from public.notifications n
      where n.user_id=r.user_id
        and n.notification_type='STALE_CASH_SESSION'
        and n.data->>'cashSessionId'=r.cash_session_id::text
        and n.created_at > now()-interval '12 hours'
    )
  )
  insert into public.notifications(user_id,notification_type,title,body,data)
  select e.user_id,
    'STALE_CASH_SESSION',
    'Caixa aberto há mais de 24 horas',
    left(e.store_name || ': confira as movimentações e feche o caixa manualmente ao encerrar o turno.',500),
    jsonb_build_object(
      'cashSessionId',e.cash_session_id,
      'storeId',e.store_id,
      'openedAt',e.opened_at,
      'alertType','STALE_CASH_SESSION'
    )
  from eligible e;

  get diagnostics v_sent = row_count;
  return jsonb_build_object('staleSessions',v_stale,'notificationsSent',v_sent);
end;
$$;

revoke all on function private.notify_stale_cash_sessions() from public, anon, authenticated;
grant execute on function private.notify_stale_cash_sessions() to service_role;

select cron.schedule(
  'clickfood-stale-cash-alerts',
  '15 * * * *',
  'select private.notify_stale_cash_sessions();'
);
