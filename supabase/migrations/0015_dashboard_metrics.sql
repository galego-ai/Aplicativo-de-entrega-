-- CLICK-FOOD: métricas agregadas dos dashboards, calculadas no banco.

create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select jsonb_build_object(
    'gmv_today', coalesce((select sum(o.total) from public.orders o where o.created_at >= date_trunc('day', now()) and o.status not in ('CANCELLED','REJECTED')), 0),
    'platform_revenue_today', coalesce((select sum(ft.amount) from public.financial_transactions ft where ft.created_at >= date_trunc('day', now()) and ft.transaction_type in ('PLATFORM_COMMISSION','SUBSCRIPTION') and ft.status='POSTED'), 0),
    'orders_today', (select count(*) from public.orders o where o.created_at >= date_trunc('day', now())),
    'active_stores', (select count(*) from public.stores s where s.status='ACTIVE'),
    'online_drivers', (select count(*) from public.drivers d where d.status='ACTIVE' and d.online=true),
    'customers', (select count(*) from public.profiles p where p.status='ACTIVE'),
    'average_ticket_today', coalesce((select avg(o.total) from public.orders o where o.created_at >= date_trunc('day', now()) and o.status not in ('CANCELLED','REJECTED')), 0),
    'past_due_invoices', (select count(*) from public.invoices i where i.status='PAST_DUE'),
    'pending_drivers', (select count(*) from public.drivers d where d.status='PENDING'),
    'failed_payments', (select count(*) from public.payments p where p.status='FAILED' and p.created_at >= date_trunc('day', now())),
    'critical_tickets', (select count(*) from public.support_tickets t where t.priority='CRITICAL' and t.status not in ('RESOLVED','CLOSED'))
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

create or replace function public.store_dashboard_metrics(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (private.is_store_member(p_store_id) or private.is_admin()) then
    raise exception 'STORE_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'sales_today', coalesce((select sum(o.total) from public.orders o where o.store_id=p_store_id and o.created_at >= date_trunc('day', now()) and o.status not in ('CANCELLED','REJECTED')), 0),
    'orders_today', (select count(*) from public.orders o where o.store_id=p_store_id and o.created_at >= date_trunc('day', now())),
    'average_ticket_today', coalesce((select avg(o.total) from public.orders o where o.store_id=p_store_id and o.created_at >= date_trunc('day', now()) and o.status not in ('CANCELLED','REJECTED')), 0),
    'delivery_orders_today', (select count(*) from public.orders o where o.store_id=p_store_id and o.created_at >= date_trunc('day', now()) and o.delivery_type='DELIVERY'),
    'pos_orders_today', (select count(*) from public.orders o where o.store_id=p_store_id and o.created_at >= date_trunc('day', now()) and o.source='POS'),
    'cancelled_today', (select count(*) from public.orders o where o.store_id=p_store_id and o.created_at >= date_trunc('day', now()) and o.status in ('CANCELLED','REJECTED')),
    'open_orders', (select count(*) from public.orders o where o.store_id=p_store_id and o.status not in ('DELIVERED','CANCELLED','REJECTED','REFUNDED')),
    'products', (select count(*) from public.products p where p.store_id=p_store_id and p.active=true),
    'low_stock', (select count(*) from public.inventory_items i where i.store_id=p_store_id and i.quantity <= i.minimum_quantity)
  ) into result;

  return result;
end;
$$;

revoke all on function public.store_dashboard_metrics(uuid) from public, anon;
grant execute on function public.store_dashboard_metrics(uuid) to authenticated;