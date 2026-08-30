create extension if not exists pg_cron;

create or replace function private.sync_billing_overdue()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_grace integer;
  v_suspend integer;
  v_auto boolean;
  v_marked integer := 0;
  v_suspended integer := 0;
begin
  select grace_days, suspend_after_days, auto_suspend
    into v_grace, v_suspend, v_auto
  from public.billing_policy
  where id = 1;

  with changed as (
    update public.invoices
       set status = 'PAST_DUE'
     where status = 'OPEN'
       and due_date < (current_date - v_grace)
    returning id, store_id, amount, due_date
  ), sub_updates as (
    update public.subscriptions s
       set status = 'PAST_DUE', updated_at = now()
      from (select distinct store_id from changed) c
     where s.store_id = c.store_id
       and s.status in ('ACTIVE','TRIAL')
    returning s.id
  ), notices as (
    insert into public.notifications(user_id, notification_type, title, body, data)
    select sm.user_id,
           'BILLING_PAST_DUE',
           'Fatura CLICK-FOOD em atraso',
           'Existe uma cobrança vencida para sua loja. Consulte o financeiro para regularizar.',
           jsonb_build_object('store_id', c.store_id, 'invoice_id', c.id, 'due_date', c.due_date, 'amount', c.amount)
      from changed c
      join public.store_memberships sm on sm.store_id = c.store_id and sm.active = true
    returning id
  )
  select count(*) into v_marked from changed;

  if v_auto then
    with severe as (
      select distinct on (i.store_id) i.store_id, i.id as invoice_id, s.status as previous_status
        from public.invoices i
        join public.stores s on s.id = i.store_id
       where i.status = 'PAST_DUE'
         and i.due_date < (current_date - v_suspend)
         and s.status = 'ACTIVE'
       order by i.store_id, i.due_date asc
    ), locks as (
      insert into public.store_billing_locks(store_id, invoice_id, previous_store_status, locked_at)
      select store_id, invoice_id, previous_status, now() from severe
      on conflict (store_id) do nothing
      returning store_id
    ), suspended_stores as (
      update public.stores s
         set status = 'SUSPENDED', updated_at = now()
        from locks l
       where s.id = l.store_id and s.status = 'ACTIVE'
      returning s.id
    ), sub_updates as (
      update public.subscriptions sub
         set status = 'SUSPENDED', updated_at = now()
        from suspended_stores ss
       where sub.store_id = ss.id
         and sub.status <> 'CANCELLED'
      returning sub.id
    ), notices as (
      insert into public.notifications(user_id, notification_type, title, body, data)
      select sm.user_id,
             'BILLING_SUSPENDED',
             'Loja suspensa por inadimplência',
             'A operação da loja foi suspensa conforme a política de cobrança. Regularize as faturas vencidas para reativação.',
             jsonb_build_object('store_id', ss.id)
        from suspended_stores ss
        join public.store_memberships sm on sm.store_id = ss.id and sm.active = true
      returning id
    )
    select count(*) into v_suspended from suspended_stores;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (null, 'BILLING_OVERDUE_SYNC_CRON', 'billing_policy', null,
          jsonb_build_object('marked_past_due', v_marked, 'suspended', v_suspended, 'ran_at', now()));

  return jsonb_build_object('markedPastDue', v_marked, 'suspended', v_suspended);
end;
$$;

revoke all on function private.sync_billing_overdue() from public, anon, authenticated;
grant execute on function private.sync_billing_overdue() to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'clickfood_daily_billing_sync' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('clickfood_daily_billing_sync', '0 8 * * *', 'select private.sync_billing_overdue();');
end $$;
