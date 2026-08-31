create or replace function public.store_dashboard_metrics(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not (private.is_store_member(p_store_id) or private.is_admin()) then
    raise exception 'STORE_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'sales_today',coalesce((select sum(o.total) from public.orders o where o.store_id=p_store_id and o.created_at>=date_trunc('day',now()) and o.status not in ('CANCELLED','REJECTED')),0),
    'orders_today',(select count(*) from public.orders o where o.store_id=p_store_id and o.created_at>=date_trunc('day',now())),
    'average_ticket_today',coalesce((select avg(o.total) from public.orders o where o.store_id=p_store_id and o.created_at>=date_trunc('day',now()) and o.status not in ('CANCELLED','REJECTED')),0),
    'delivery_orders_today',(select count(*) from public.orders o where o.store_id=p_store_id and o.created_at>=date_trunc('day',now()) and o.delivery_type='DELIVERY'),
    'pos_orders_today',(select count(*) from public.orders o where o.store_id=p_store_id and o.created_at>=date_trunc('day',now()) and o.source='POS'),
    'cancelled_today',(select count(*) from public.orders o where o.store_id=p_store_id and o.created_at>=date_trunc('day',now()) and o.status in ('CANCELLED','REJECTED')),
    'open_orders',(select count(*) from public.orders o where o.store_id=p_store_id and o.status not in ('DELIVERED','CANCELLED','REJECTED','REFUNDED','PAYMENT_FAILED')),
    'products',(select count(*) from public.products p where p.store_id=p_store_id and p.active=true),
    'low_stock',(select count(*) from public.inventory_items i where i.store_id=p_store_id and i.quantity<=i.minimum_quantity)
  ) into result;
  return result;
end;
$$;

revoke all on function public.store_dashboard_metrics(uuid) from public, anon;
grant execute on function public.store_dashboard_metrics(uuid) to authenticated, service_role;

create or replace function public.store_coupon_list(p_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not (private.is_store_member(p_store_id) or private.is_admin()) then
    raise exception 'STORE_ACCESS_DENIED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',c.id,
      'code',c.code,
      'discount_type',c.discount_type,
      'discount_value',c.discount_value,
      'minimum_order',c.minimum_order,
      'max_uses',c.max_uses,
      'ends_at',c.ends_at,
      'active',c.active
    ) order by c.created_at desc
  ),'[]'::jsonb)
  into result
  from public.coupons c
  where c.store_id=p_store_id;

  return result;
end;
$$;

revoke all on function public.store_coupon_list(uuid) from public, anon;
grant execute on function public.store_coupon_list(uuid) to authenticated, service_role;
