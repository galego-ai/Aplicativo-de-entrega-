-- Permite que Loja/Matriz concluam uma entrega travada em ocorrência
-- quando ela já estiver na etapa final, liberando o entregador com auditoria.
create or replace function public.store_confirm_delivery_atomic(p_order_id uuid, p_actor_id uuid)
returns public.deliveries
language plpgsql
set search_path to ''
as $function$
declare
  v_order_status text;
  v_delivery_type text;
  v_delivery_id uuid;
  v_delivery_status text;
  v_driver_id uuid;
  v_offline_payment_id uuid;
  v_offline_payment_status text;
  v_incident_previous_status text;
  v_result public.deliveries%rowtype;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;

  select o.status::text,o.delivery_type::text
    into v_order_status,v_delivery_type
    from public.orders o where o.id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_delivery_type <> 'DELIVERY' then raise exception 'DELIVERY_ORDER_REQUIRED'; end if;
  if v_order_status in ('DELIVERED','CANCELLED','REJECTED','REFUNDED') then raise exception 'ORDER_ALREADY_TERMINAL'; end if;

  select d.id,d.status::text,d.driver_id
    into v_delivery_id,v_delivery_status,v_driver_id
    from public.deliveries d where d.order_id=p_order_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_driver_id is null then raise exception 'DRIVER_NOT_ASSIGNED'; end if;

  if v_delivery_status='INCIDENT' then
    select di.previous_status::text into v_incident_previous_status
      from public.delivery_incidents di
     where di.delivery_id=v_delivery_id and di.status='OPEN'
     order by di.opened_at desc limit 1 for update;
    if v_incident_previous_status is null then raise exception 'OPEN_INCIDENT_REQUIRED'; end if;
    if v_order_status not in ('PICKED_UP','ON_THE_WAY')
       and v_incident_previous_status not in ('PICKUP_CONFIRMED','DRIVER_TO_CUSTOMER','DRIVER_AT_CUSTOMER') then
      raise exception 'INCIDENT_NOT_ELIGIBLE_FOR_COMPLETION';
    end if;
  elsif v_delivery_status not in ('PICKUP_CONFIRMED','DRIVER_TO_CUSTOMER','DRIVER_AT_CUSTOMER') then
    raise exception 'DELIVERY_NOT_ELIGIBLE_FOR_STORE_COMPLETION';
  end if;

  select p.id,p.status::text into v_offline_payment_id,v_offline_payment_status
    from public.payments p
   where p.order_id=p_order_id and (p.method='CASH' or p.provider='DELIVERY_POS')
   order by p.created_at desc limit 1 for update;

  if v_offline_payment_id is not null and v_offline_payment_status in ('PENDING','PROCESSING') then
    update public.payments set status='PAID',paid_at=coalesce(paid_at,now()) where id=v_offline_payment_id;
  end if;

  update public.delivery_incidents
     set status='RESOLVED',resolution='COMPLETED_BY_STORE_OR_MATRIX',resolved_by=p_actor_id,resolved_at=coalesce(resolved_at,now()),updated_at=now()
   where delivery_id=v_delivery_id and status='OPEN';

  update public.deliveries
     set status='DELIVERED',delivered_at=coalesce(delivered_at,now()),updated_at=now()
   where id=v_delivery_id returning * into v_result;

  update public.orders
     set status='DELIVERED',payment_status=case when v_offline_payment_id is not null then 'PAID' else payment_status end,
         delivered_at=coalesce(delivered_at,now()),updated_at=now()
   where id=p_order_id;

  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(p_order_id,'DELIVERED',p_actor_id,'Entrega confirmada manualmente pela Loja/Matriz para liberar o entregador');

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(p_actor_id,
    case when v_delivery_status='INCIDENT' then 'ADMIN_OR_STORE_RESOLVED_INCIDENT_AS_DELIVERED' else 'STORE_MARKED_DELIVERY_DELIVERED' end,
    'delivery',v_delivery_id,
    jsonb_build_object('order_id',p_order_id,'driver_id',v_driver_id,'previous_order_status',v_order_status,
      'previous_delivery_status',v_delivery_status,'incident_previous_status',v_incident_previous_status,'final_status','DELIVERED'));

  return v_result;
end;
$function$;
