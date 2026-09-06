-- CLICK-FOOD: contingência operacional para o Lojista concluir uma entrega já retirada
-- e liberar o entregador para receber novos chamados.

create or replace function public.store_confirm_delivery_atomic(
  p_order_id uuid,
  p_actor_id uuid
)
returns public.deliveries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
  v_offline_payment public.payments%rowtype;
  v_previous_order_status text;
  v_previous_delivery_status text;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;

  select * into v_order
    from public.orders
   where id = p_order_id
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.delivery_type <> 'DELIVERY' then raise exception 'DELIVERY_ORDER_REQUIRED'; end if;
  if v_order.status not in ('PICKED_UP','ON_THE_WAY') then raise exception 'ORDER_NOT_IN_FINAL_DELIVERY_LEG'; end if;

  select * into v_delivery
    from public.deliveries
   where order_id = p_order_id
   for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id is null then raise exception 'DRIVER_NOT_ASSIGNED'; end if;
  if v_delivery.status not in ('PICKUP_CONFIRMED','DRIVER_TO_CUSTOMER','DRIVER_AT_CUSTOMER') then
    raise exception 'DELIVERY_NOT_ELIGIBLE_FOR_STORE_COMPLETION';
  end if;

  v_previous_order_status := v_order.status;
  v_previous_delivery_status := v_delivery.status;

  select * into v_offline_payment
    from public.payments
   where order_id = v_order.id
     and (method = 'CASH' or provider = 'DELIVERY_POS')
   order by created_at desc
   limit 1
   for update;

  if found and v_offline_payment.status in ('PENDING','PROCESSING') then
    update public.payments
       set status = 'PAID',
           paid_at = coalesce(paid_at, now())
     where id = v_offline_payment.id;
  end if;

  update public.deliveries
     set status = 'DELIVERED',
         delivered_at = coalesce(delivered_at, now()),
         updated_at = now()
   where id = v_delivery.id
   returning * into v_delivery;

  update public.orders
     set status = 'DELIVERED',
         payment_status = case when v_offline_payment.id is not null then 'PAID' else payment_status end,
         delivered_at = coalesce(delivered_at, now()),
         updated_at = now()
   where id = v_order.id;

  insert into public.order_status_history(order_id, status, changed_by, reason)
  values(v_order.id, 'DELIVERED', p_actor_id, 'Entrega confirmada manualmente pela loja para liberar o entregador');

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values(
    p_actor_id,
    'STORE_MARKED_DELIVERY_DELIVERED',
    'delivery',
    v_delivery.id,
    jsonb_build_object(
      'order_id', v_order.id,
      'driver_id', v_delivery.driver_id,
      'previous_order_status', v_previous_order_status,
      'previous_delivery_status', v_previous_delivery_status,
      'final_status', 'DELIVERED'
    )
  );

  return v_delivery;
end;
$$;

revoke all on function public.store_confirm_delivery_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.store_confirm_delivery_atomic(uuid,uuid) to service_role;
