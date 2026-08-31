create table if not exists private.operational_health_alert_state (
  singleton boolean primary key default true check (singleton),
  last_status text not null default 'HEALTHY' check (last_status in ('HEALTHY','ATTENTION')),
  last_fingerprint text,
  last_notified_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into private.operational_health_alert_state(singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function private.run_operational_health_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_health jsonb;
  v_issues jsonb;
  v_issue_count bigint;
  v_fingerprint text;
  v_state private.operational_health_alert_state%rowtype;
  v_should_notify boolean := false;
  v_has_critical boolean := false;
  v_summary text := '';
  v_item jsonb;
  v_sent integer := 0;
begin
  v_health := private.admin_operational_health();
  v_issue_count := coalesce((v_health->>'total_issues')::bigint, 0);

  select coalesce(jsonb_agg(value order by value->>'key'), '[]'::jsonb)
    into v_issues
  from jsonb_array_elements(coalesce(v_health->'checks','[]'::jsonb)) value
  where coalesce((value->>'count')::bigint,0) > 0;

  v_fingerprint := md5(v_issues::text);

  select * into v_state
  from private.operational_health_alert_state
  where singleton=true
  for update;

  if v_issue_count > 0 then
    select exists(
      select 1 from jsonb_array_elements(v_issues) x
      where x->>'severity'='CRITICAL'
    ) into v_has_critical;

    for v_item in select value from jsonb_array_elements(v_issues) value limit 3 loop
      v_summary := v_summary || case when v_summary='' then '' else ' • ' end ||
        coalesce(v_item->>'label',v_item->>'key','Alerta') || ': ' || coalesce(v_item->>'count','0');
    end loop;

    v_should_notify := v_state.last_status <> 'ATTENTION'
      or v_state.last_fingerprint is distinct from v_fingerprint
      or v_state.last_notified_at is null
      or v_state.last_notified_at < now() - interval '6 hours';

    if v_should_notify then
      insert into public.notifications(user_id,notification_type,title,body,data)
      select u.id,
        'OPERATIONAL_HEALTH_ALERT',
        case when v_has_critical then 'Atenção crítica no CLICK-FOOD' else 'Atenção na saúde operacional' end,
        left(v_summary,500),
        jsonb_build_object(
          'healthStatus','ATTENTION',
          'totalIssues',v_issue_count,
          'checks',v_issues,
          'checkedAt',v_health->'checked_at'
        )
      from auth.users u
      where coalesce(u.raw_app_meta_data->>'clickfood_role','') in ('SUPER_ADMIN','ADMIN','SUPPORT');
      get diagnostics v_sent = row_count;
    end if;

    update private.operational_health_alert_state
    set last_status='ATTENTION',
        last_fingerprint=v_fingerprint,
        last_notified_at=case when v_should_notify then now() else last_notified_at end,
        updated_at=now()
    where singleton=true;
  else
    if v_state.last_status='ATTENTION' then
      insert into public.notifications(user_id,notification_type,title,body,data)
      select u.id,
        'OPERATIONAL_HEALTH_RECOVERED',
        'Saúde operacional normalizada',
        'Os alertas anteriores foram resolvidos. O núcleo operacional e financeiro voltou ao estado saudável.',
        jsonb_build_object('healthStatus','HEALTHY','totalIssues',0,'checkedAt',v_health->'checked_at')
      from auth.users u
      where coalesce(u.raw_app_meta_data->>'clickfood_role','') in ('SUPER_ADMIN','ADMIN','SUPPORT');
      get diagnostics v_sent = row_count;
    end if;

    update private.operational_health_alert_state
    set last_status='HEALTHY',
        last_fingerprint=null,
        last_notified_at=case when v_state.last_status='ATTENTION' then now() else last_notified_at end,
        updated_at=now()
    where singleton=true;
  end if;

  return jsonb_build_object(
    'status', case when v_issue_count=0 then 'HEALTHY' else 'ATTENTION' end,
    'totalIssues', v_issue_count,
    'notified', v_sent,
    'fingerprint', case when v_issue_count=0 then null else v_fingerprint end
  );
end;
$$;

revoke all on function private.run_operational_health_alerts() from public, anon, authenticated;
grant execute on function private.run_operational_health_alerts() to service_role;

create or replace function private.admin_operational_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivered_without_order_sale bigint;
  v_paid_order_without_paid_payment bigint;
  v_paid_payment_order_not_paid bigint;
  v_terminal_order_active_delivery bigint;
  v_negative_inventory bigint;
  v_duplicate_open_cash_registers bigint;
  v_old_pending_payments bigint;
  v_old_processing_refunds bigint;
  v_failed_refunds bigint;
  v_old_processing_payouts bigint;
  v_failed_payouts bigint;
  v_contested_card_charges bigint;
  v_inactive_critical_jobs bigint;
  v_total bigint;
begin
  select count(*) into v_delivered_without_order_sale
  from public.orders o
  where o.status='DELIVERED'
    and not exists (
      select 1 from public.financial_transactions ft
      where ft.order_id=o.id and ft.transaction_type='ORDER_SALE' and ft.status='POSTED'
    );

  select count(*) into v_paid_order_without_paid_payment
  from public.orders o
  where o.payment_status='PAID'
    and not exists (select 1 from public.payments p where p.order_id=o.id and p.status='PAID');

  select count(*) into v_paid_payment_order_not_paid
  from public.payments p
  join public.orders o on o.id=p.order_id
  where p.status='PAID' and o.payment_status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');

  select count(*) into v_terminal_order_active_delivery
  from public.orders o
  join public.deliveries d on d.order_id=o.id
  where o.status in ('DELIVERED','CANCELLED','REJECTED','PAYMENT_FAILED','REFUNDED')
    and d.status not in ('DELIVERED','DELIVERY_CANCELLED');

  select count(*) into v_negative_inventory from public.inventory_items where quantity<0;

  select count(*) into v_duplicate_open_cash_registers
  from (
    select cash_register_id from public.cash_sessions where status='OPEN'
    group by cash_register_id having count(*)>1
  ) x;

  select count(*) into v_old_pending_payments
  from public.orders where status='PENDING_PAYMENT' and created_at<now()-interval '2 hours';

  select count(*) into v_old_processing_refunds
  from public.refunds where status in ('PENDING','PROCESSING') and created_at<now()-interval '30 minutes';

  select count(*) into v_failed_refunds from public.refunds where status='FAILED';

  select count(*) into v_old_processing_payouts
  from public.payouts where status='PROCESSING' and updated_at<now()-interval '30 minutes';

  select count(*) into v_failed_payouts from public.payouts where status='FAILED';

  select count(*) into v_contested_card_charges
  from public.efi_card_charges where status='CONTESTED';

  with expected(jobname) as (
    values
      ('clickfood_daily_billing_sync'),
      ('clickfood_driver_document_expiration'),
      ('clickfood_push_dispatch'),
      ('clickfood_push_reconcile'),
      ('clickfood-auto-delivery-dispatch'),
      ('clickfood-efi-card-abandoned-cleanup'),
      ('clickfood-efi-payout-worker'),
      ('clickfood-efi-pix-stale-cleanup'),
      ('clickfood-expire-loyalty-redemptions'),
      ('clickfood-stale-idle-drivers-offline'),
      ('clickfood-operational-health-alerts')
  )
  select count(*) into v_inactive_critical_jobs
  from expected e
  left join cron.job j on j.jobname=e.jobname and j.active=true
  where j.jobid is null;

  v_total := v_delivered_without_order_sale + v_paid_order_without_paid_payment +
    v_paid_payment_order_not_paid + v_terminal_order_active_delivery + v_negative_inventory +
    v_duplicate_open_cash_registers + v_old_pending_payments + v_old_processing_refunds +
    v_failed_refunds + v_old_processing_payouts + v_failed_payouts + v_contested_card_charges +
    v_inactive_critical_jobs;

  return jsonb_build_object(
    'checked_at', now(),
    'status', case when v_total=0 then 'HEALTHY' else 'ATTENTION' end,
    'total_issues', v_total,
    'checks', jsonb_build_array(
      jsonb_build_object('key','delivered_without_order_sale','label','Pedidos entregues sem lançamento financeiro','count',v_delivered_without_order_sale,'severity','CRITICAL'),
      jsonb_build_object('key','paid_order_without_paid_payment','label','Pedidos marcados pagos sem pagamento confirmado','count',v_paid_order_without_paid_payment,'severity','CRITICAL'),
      jsonb_build_object('key','paid_payment_order_not_paid','label','Pagamentos confirmados sem refletir no pedido','count',v_paid_payment_order_not_paid,'severity','CRITICAL'),
      jsonb_build_object('key','terminal_order_active_delivery','label','Pedidos encerrados com entrega ainda ativa','count',v_terminal_order_active_delivery,'severity','CRITICAL'),
      jsonb_build_object('key','negative_inventory','label','Itens com estoque negativo','count',v_negative_inventory,'severity','CRITICAL'),
      jsonb_build_object('key','duplicate_open_cash_registers','label','Caixas com mais de uma sessão aberta','count',v_duplicate_open_cash_registers,'severity','WARNING'),
      jsonb_build_object('key','old_pending_payments','label','Pedidos aguardando pagamento há mais de 2 horas','count',v_old_pending_payments,'severity','WARNING'),
      jsonb_build_object('key','old_processing_refunds','label','Estornos processando há mais de 30 minutos','count',v_old_processing_refunds,'severity','WARNING'),
      jsonb_build_object('key','failed_refunds','label','Estornos com falha','count',v_failed_refunds,'severity','CRITICAL'),
      jsonb_build_object('key','old_processing_payouts','label','Repasses processando há mais de 30 minutos','count',v_old_processing_payouts,'severity','WARNING'),
      jsonb_build_object('key','failed_payouts','label','Repasses com falha','count',v_failed_payouts,'severity','WARNING'),
      jsonb_build_object('key','contested_card_charges','label','Pagamentos por cartão em contestação','count',v_contested_card_charges,'severity','CRITICAL'),
      jsonb_build_object('key','inactive_critical_jobs','label','Agendadores críticos ausentes ou desativados','count',v_inactive_critical_jobs,'severity','CRITICAL')
    )
  );
end;
$$;

revoke all on function private.admin_operational_health() from public, anon, authenticated;
grant execute on function private.admin_operational_health() to service_role;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='clickfood-operational-health-alerts';
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule(
  'clickfood-operational-health-alerts',
  '*/10 * * * *',
  $cron$select private.run_operational_health_alerts();$cron$
);
