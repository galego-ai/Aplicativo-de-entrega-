-- CLICK-FOOD: sincronização atômica entre orders e deliveries.

create or replace function public.accept_delivery_offer_atomic(
  p_offer_id uuid,
  p_driver_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offer public.delivery_offers%rowtype;
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if v_offer.driver_id <> p_driver_id then raise exception 'OFFER_DRIVER_MISMATCH'; end if;
  if v_offer.status <> 'PENDING' then raise exception 'OFFER_NOT_PENDING'; end if;
  if v_offer.expires_at <= now() then
    update public.delivery_offers set status='EXPIRED', responded_at=now() where id=p_offer_id;
    raise exception 'OFFER_EXPIRED';
  end if;

  select * into v_delivery from public.deliveries where id=v_offer.delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id is not null or v_delivery.status not in ('SEARCHING_DRIVER','OFFER_SENT') then
    raise exception 'DELIVERY_ALREADY_ASSIGNED';
  end if;

  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status not in ('READY','WAITING_DRIVER') then raise exception 'ORDER_NOT_WAITING_DRIVER'; end if;

  update public.deliveries
  set driver_id=p_driver_id, driver_earning=v_offer.offered_earning, status='DRIVER_ASSIGNED', updated_at=now()
  where id=v_delivery.id;

  update public.delivery_offers
  set status=case when id=p_offer_id then 'ACCEPTED' else 'EXPIRED' end,
      responded_at=case when id=p_offer_id then now() else responded_at end
  where delivery_id=v_delivery.id and status='PENDING';

  update public.orders set status='DRIVER_ASSIGNED', updated_at=now() where id=v_order.id;
  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(v_order.id,'DRIVER_ASSIGNED',null,'Entregador atribuído automaticamente');

  return v_delivery.id;
end;
$$;

revoke all on function public.accept_delivery_offer_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.accept_delivery_offer_atomic(uuid,uuid) to service_role;

create or replace function public.confirm_pickup_atomic(
  p_delivery_id uuid,
  p_driver_id uuid
)
returns public.deliveries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id <> p_driver_id then raise exception 'DELIVERY_DRIVER_MISMATCH'; end if;
  if v_delivery.status <> 'DRIVER_AT_STORE' then raise exception 'DELIVERY_NOT_AT_STORE'; end if;

  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'DRIVER_ASSIGNED' then raise exception 'ORDER_STATUS_CHANGED'; end if;

  update public.deliveries
  set status='PICKUP_CONFIRMED', pickup_at=coalesce(pickup_at,now()), updated_at=now()
  where id=v_delivery.id returning * into v_delivery;

  update public.orders set status='PICKED_UP', updated_at=now() where id=v_order.id;
  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(v_order.id,'PICKED_UP',null,'Retirada confirmada por código');

  return v_delivery;
end;
$$;

revoke all on function public.confirm_pickup_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.confirm_pickup_atomic(uuid,uuid) to service_role;

create or replace function public.start_customer_route_atomic(
  p_delivery_id uuid,
  p_driver_id uuid
)
returns public.deliveries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id <> p_driver_id then raise exception 'DELIVERY_DRIVER_MISMATCH'; end if;
  if v_delivery.status <> 'PICKUP_CONFIRMED' then raise exception 'PICKUP_NOT_CONFIRMED'; end if;

  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if v_order.status <> 'PICKED_UP' then raise exception 'ORDER_STATUS_CHANGED'; end if;

  update public.deliveries set status='DRIVER_TO_CUSTOMER', updated_at=now()
  where id=v_delivery.id returning * into v_delivery;
  update public.orders set status='ON_THE_WAY', updated_at=now() where id=v_order.id;
  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(v_order.id,'ON_THE_WAY',null,'Entrega iniciada');
  return v_delivery;
end;
$$;

revoke all on function public.start_customer_route_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.start_customer_route_atomic(uuid,uuid) to service_role;

create or replace function public.confirm_delivery_atomic(
  p_delivery_id uuid,
  p_driver_id uuid
)
returns public.deliveries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id <> p_driver_id then raise exception 'DELIVERY_DRIVER_MISMATCH'; end if;
  if v_delivery.status <> 'DRIVER_AT_CUSTOMER' then raise exception 'DELIVERY_NOT_AT_CUSTOMER'; end if;

  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if v_order.status <> 'ON_THE_WAY' then raise exception 'ORDER_STATUS_CHANGED'; end if;

  update public.deliveries
  set status='DELIVERED', delivered_at=coalesce(delivered_at,now()), updated_at=now()
  where id=v_delivery.id returning * into v_delivery;

  update public.orders
  set status='DELIVERED', delivered_at=coalesce(delivered_at,now()), updated_at=now()
  where id=v_order.id;
  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(v_order.id,'DELIVERED',null,'Entrega confirmada por código');
  return v_delivery;
end;
$$;

revoke all on function public.confirm_delivery_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.confirm_delivery_atomic(uuid,uuid) to service_role;
