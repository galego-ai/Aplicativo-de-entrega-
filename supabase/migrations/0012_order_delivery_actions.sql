-- CLICK-FOOD: transições atômicas e auditáveis de pedido e delivery.

create or replace function public.transition_order_atomic(
  p_order_id uuid,
  p_expected_status text,
  p_next_status text,
  p_actor_id uuid,
  p_reason text default null
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> p_expected_status then raise exception 'ORDER_STATUS_CHANGED'; end if;

  v_allowed := case v_order.status
    when 'PENDING_PAYMENT' then p_next_status in ('WAITING_STORE','PAYMENT_FAILED','CANCELLED')
    when 'WAITING_STORE' then p_next_status in ('ACCEPTED','REJECTED','CANCELLED')
    when 'ACCEPTED' then p_next_status in ('PREPARING','CANCELLED')
    when 'PREPARING' then p_next_status in ('READY','CANCELLED')
    when 'READY' then p_next_status in ('WAITING_DRIVER','DRIVER_ASSIGNED','PICKED_UP','CANCELLED')
    when 'WAITING_DRIVER' then p_next_status in ('DRIVER_ASSIGNED','CANCELLED')
    when 'DRIVER_ASSIGNED' then p_next_status in ('PICKED_UP','CANCELLED')
    when 'PICKED_UP' then p_next_status in ('ON_THE_WAY','CANCELLED')
    when 'ON_THE_WAY' then p_next_status in ('DELIVERED','CANCELLED')
    when 'DELIVERED' then p_next_status = 'REFUNDED'
    when 'REJECTED' then p_next_status = 'REFUNDED'
    when 'CANCELLED' then p_next_status = 'REFUNDED'
    when 'PAYMENT_FAILED' then p_next_status in ('PENDING_PAYMENT','CANCELLED')
    else false
  end;

  if not v_allowed then raise exception 'INVALID_ORDER_TRANSITION'; end if;

  update public.orders
  set status = p_next_status,
      accepted_at = case when p_next_status = 'ACCEPTED' then coalesce(accepted_at, now()) else accepted_at end,
      ready_at = case when p_next_status = 'READY' then coalesce(ready_at, now()) else ready_at end,
      delivered_at = case when p_next_status = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
      cancelled_at = case when p_next_status in ('CANCELLED','REJECTED') then coalesce(cancelled_at, now()) else cancelled_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(p_order_id,p_next_status,p_actor_id,p_reason);

  return v_order;
end;
$$;

revoke all on function public.transition_order_atomic(uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.transition_order_atomic(uuid,text,text,uuid,text) to service_role;

create or replace function public.transition_delivery_atomic(
  p_delivery_id uuid,
  p_expected_status text,
  p_next_status text,
  p_driver_id uuid
)
returns public.deliveries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_allowed boolean := false;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id <> p_driver_id then raise exception 'DELIVERY_DRIVER_MISMATCH'; end if;
  if v_delivery.status <> p_expected_status then raise exception 'DELIVERY_STATUS_CHANGED'; end if;

  v_allowed := case v_delivery.status
    when 'DRIVER_ASSIGNED' then p_next_status = 'DRIVER_TO_STORE'
    when 'DRIVER_TO_STORE' then p_next_status = 'DRIVER_AT_STORE'
    when 'DRIVER_AT_STORE' then p_next_status in ('PICKUP_CONFIRMED','INCIDENT')
    when 'PICKUP_CONFIRMED' then p_next_status = 'DRIVER_TO_CUSTOMER'
    when 'DRIVER_TO_CUSTOMER' then p_next_status in ('DRIVER_AT_CUSTOMER','INCIDENT')
    when 'DRIVER_AT_CUSTOMER' then p_next_status in ('DELIVERED','CUSTOMER_UNAVAILABLE','INCIDENT')
    when 'CUSTOMER_UNAVAILABLE' then p_next_status in ('RETURN_REQUIRED','DELIVERED')
    when 'RETURN_REQUIRED' then p_next_status in ('DELIVERED','INCIDENT')
    else false
  end;

  if not v_allowed then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;

  update public.deliveries
  set status = p_next_status,
      pickup_at = case when p_next_status = 'PICKUP_CONFIRMED' then coalesce(pickup_at,now()) else pickup_at end,
      delivered_at = case when p_next_status = 'DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,
      updated_at = now()
  where id = p_delivery_id
  returning * into v_delivery;

  return v_delivery;
end;
$$;

revoke all on function public.transition_delivery_atomic(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.transition_delivery_atomic(uuid,text,text,uuid) to service_role;
