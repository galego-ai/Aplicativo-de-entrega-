create or replace function public.assign_delivery_manual_atomic(
  p_order_id uuid,
  p_driver_id uuid,
  p_driver_earning numeric,
  p_actor_id uuid
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_store public.stores%rowtype;
  v_driver public.drivers%rowtype;
  v_delivery public.deliveries%rowtype;
begin
  if p_driver_earning is null or p_driver_earning < 0 then
    raise exception 'INVALID_DRIVER_EARNING';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.delivery_type <> 'DELIVERY' then raise exception 'ORDER_NOT_DELIVERY'; end if;
  if v_order.status not in ('READY','WAITING_DRIVER') then raise exception 'ORDER_NOT_WAITING_DRIVER'; end if;

  select * into v_store from public.stores where id=v_order.store_id;
  if not found then raise exception 'STORE_NOT_FOUND'; end if;

  select * into v_driver from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'DRIVER_NOT_FOUND'; end if;
  if v_driver.status <> 'ACTIVE' or not v_driver.online then raise exception 'DRIVER_NOT_AVAILABLE'; end if;
  if v_driver.city_id is distinct from v_store.city_id then raise exception 'DRIVER_WRONG_CITY'; end if;

  if exists(
    select 1 from public.deliveries d
    where d.driver_id=p_driver_id
      and d.order_id<>p_order_id
      and d.status not in ('DELIVERED','DELIVERY_CANCELLED')
  ) then raise exception 'DRIVER_BUSY'; end if;

  select * into v_delivery from public.deliveries where order_id=p_order_id for update;
  if not found then
    insert into public.deliveries(order_id,status,delivery_fee,driver_earning)
    values(p_order_id,'SEARCHING_DRIVER',v_order.delivery_fee,0)
    returning * into v_delivery;
  end if;

  if v_delivery.driver_id is not null then raise exception 'DELIVERY_ALREADY_ASSIGNED'; end if;
  if v_delivery.status not in ('SEARCHING_DRIVER','OFFER_SENT') then raise exception 'DELIVERY_NOT_ASSIGNABLE'; end if;

  update public.deliveries
     set driver_id=p_driver_id,
         driver_earning=round(p_driver_earning,2),
         status='DRIVER_ASSIGNED',
         updated_at=now()
   where id=v_delivery.id;

  update public.delivery_offers
     set status='EXPIRED',
         responded_at=coalesce(responded_at,now())
   where delivery_id=v_delivery.id and status='PENDING';

  update public.orders
     set status='DRIVER_ASSIGNED',updated_at=now()
   where id=p_order_id;

  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(p_order_id,'DRIVER_ASSIGNED',p_actor_id,'Entregador atribuído manualmente pelo lojista');

  return v_delivery.id;
end;
$$;

revoke all on function public.assign_delivery_manual_atomic(uuid,uuid,numeric,uuid) from public, anon, authenticated;
grant execute on function public.assign_delivery_manual_atomic(uuid,uuid,numeric,uuid) to service_role;
