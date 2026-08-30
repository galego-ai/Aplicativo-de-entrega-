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
      ('clickfood-stale-idle-drivers-offline')
  )
  select count(*) into v_inactive_critical_jobs
  from expected e
  left join cron.job j on j.jobname=e.jobname and j.active=true
  where j.jobid is null;

  v_total := v_delivered_without_order_sale + v_paid_order_without_paid_payment +
    v_paid_payment_order_not_paid + v_terminal_order_active_delivery + v_negative_inventory +
    v_duplicate_open_cash_registers + v_old_pending_payments + v_old_processing_refunds +
    v_failed_refunds + v_old_processing_payouts + v_failed_payouts + v_inactive_critical_jobs;

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
      jsonb_build_object('key','inactive_critical_jobs','label','Agendadores críticos ausentes ou desativados','count',v_inactive_critical_jobs,'severity','CRITICAL')
    )
  );
end;
$$;

revoke all on function private.admin_operational_health() from public, anon, authenticated;
grant execute on function private.admin_operational_health() to service_role;
