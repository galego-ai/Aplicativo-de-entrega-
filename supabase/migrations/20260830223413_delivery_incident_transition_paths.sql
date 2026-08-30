create or replace function public.transition_delivery_atomic(p_delivery_id uuid, p_expected_status text, p_next_status text, p_driver_id uuid)
returns public.deliveries
language plpgsql
set search_path to ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_allowed boolean := false;
begin
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id <> p_driver_id then raise exception 'DELIVERY_DRIVER_MISMATCH'; end if;
  if v_delivery.status <> p_expected_status then raise exception 'DELIVERY_STATUS_CHANGED'; end if;

  v_allowed := case v_delivery.status
    when 'DRIVER_ASSIGNED' then p_next_status in ('DRIVER_TO_STORE','INCIDENT')
    when 'DRIVER_TO_STORE' then p_next_status in ('DRIVER_AT_STORE','INCIDENT')
    when 'DRIVER_AT_STORE' then p_next_status in ('PICKUP_CONFIRMED','INCIDENT')
    when 'PICKUP_CONFIRMED' then p_next_status in ('DRIVER_TO_CUSTOMER','INCIDENT')
    when 'DRIVER_TO_CUSTOMER' then p_next_status in ('DRIVER_AT_CUSTOMER','INCIDENT')
    when 'DRIVER_AT_CUSTOMER' then p_next_status in ('DELIVERED','CUSTOMER_UNAVAILABLE','INCIDENT')
    when 'CUSTOMER_UNAVAILABLE' then p_next_status in ('RETURN_REQUIRED','DELIVERED')
    when 'RETURN_REQUIRED' then p_next_status in ('DELIVERED','INCIDENT')
    else false
  end;

  if not v_allowed then raise exception 'INVALID_DELIVERY_TRANSITION'; end if;

  update public.deliveries
  set status=p_next_status,
      pickup_at=case when p_next_status='PICKUP_CONFIRMED' then coalesce(pickup_at,now()) else pickup_at end,
      delivered_at=case when p_next_status='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,
      updated_at=now()
  where id=p_delivery_id
  returning * into v_delivery;

  return v_delivery;
end;
$$;
