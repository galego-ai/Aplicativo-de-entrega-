create or replace function private.resolve_delivery_incident_atomic(p_delivery_id uuid,p_action text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_incident public.delivery_incidents%rowtype;
  v_target text;
  v_payment public.payments%rowtype;
  v_refund_required boolean := false;
begin
  if p_action not in ('RESUME','REASSIGN','REQUIRE_RETURN','COMPLETE_RETURN') then raise exception 'INVALID_INCIDENT_ACTION'; end if;
  select * into v_delivery from public.deliveries where id=p_delivery_id for update; if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  select * into v_order from public.orders where id=v_delivery.order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_incident from public.delivery_incidents where delivery_id=p_delivery_id and status in ('OPEN','RETURN_REQUIRED') order by opened_at desc limit 1 for update; if not found then raise exception 'ACTIVE_INCIDENT_NOT_FOUND'; end if;

  if p_action='RESUME' then
    if v_delivery.status not in ('INCIDENT','CUSTOMER_UNAVAILABLE') then raise exception 'INCIDENT_NOT_RESUMABLE'; end if;
    v_target:=v_incident.previous_status;
    if v_target not in ('DRIVER_ASSIGNED','DRIVER_TO_STORE','DRIVER_AT_STORE','PICKUP_CONFIRMED','DRIVER_TO_CUSTOMER','DRIVER_AT_CUSTOMER') then raise exception 'INVALID_RESUME_STATUS'; end if;
    update public.deliveries set status=v_target,updated_at=now() where id=v_delivery.id;
    update public.delivery_incidents set status='RESOLVED',resolution='RESUMED',resolved_by=p_actor_id,resolved_at=now(),updated_at=now() where id=v_incident.id;
    return jsonb_build_object('action','RESUME','deliveryStatus',v_target,'orderId',v_order.id,'incidentId',v_incident.id,'refundRequired',false,'dispatchRequired',false);
  end if;

  if p_action='REASSIGN' then
    if v_delivery.status<>'INCIDENT' or v_delivery.pickup_at is not null then raise exception 'INCIDENT_NOT_REASSIGNABLE'; end if;
    if v_incident.previous_status not in ('DRIVER_ASSIGNED','DRIVER_TO_STORE','DRIVER_AT_STORE') then raise exception 'INCIDENT_NOT_REASSIGNABLE'; end if;
    update public.delivery_offers set status='EXPIRED',responded_at=coalesce(responded_at,now()) where delivery_id=v_delivery.id and status='PENDING';
    update public.deliveries set driver_id=null,status='SEARCHING_DRIVER',updated_at=now() where id=v_delivery.id;
    update public.orders set status='WAITING_DRIVER',updated_at=now() where id=v_order.id;
    insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'WAITING_DRIVER',p_actor_id,'Entregador liberado após incidente; nova busca solicitada');
    update public.delivery_incidents set status='RESOLVED',resolution='REASSIGNED',resolved_by=p_actor_id,resolved_at=now(),updated_at=now() where id=v_incident.id;
    return jsonb_build_object('action','REASSIGN','deliveryStatus','SEARCHING_DRIVER','orderStatus','WAITING_DRIVER','orderId',v_order.id,'incidentId',v_incident.id,'refundRequired',false,'dispatchRequired',true);
  end if;

  if p_action='REQUIRE_RETURN' then
    if v_delivery.status not in ('INCIDENT','CUSTOMER_UNAVAILABLE') or v_delivery.pickup_at is null then raise exception 'RETURN_REQUIRES_PICKUP'; end if;
    update public.deliveries set status='RETURN_REQUIRED',updated_at=now() where id=v_delivery.id;
    update public.delivery_incidents set status='RETURN_REQUIRED',resolution='RETURN_REQUESTED',updated_at=now() where id=v_incident.id;
    return jsonb_build_object('action','REQUIRE_RETURN','deliveryStatus','RETURN_REQUIRED','orderId',v_order.id,'incidentId',v_incident.id,'refundRequired',false,'dispatchRequired',false);
  end if;

  if v_delivery.status<>'RETURN_REQUIRED' then raise exception 'RETURN_NOT_REQUIRED'; end if;
  update public.deliveries set status='DELIVERY_CANCELLED',updated_at=now() where id=v_delivery.id;
  update public.orders set status='CANCELLED',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=v_order.id;
  insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'CANCELLED',p_actor_id,'Retorno do pedido confirmado pela operação');

  select * into v_payment from public.payments where order_id=v_order.id order by created_at desc limit 1 for update;
  if found then
    if v_payment.status in ('PENDING','PROCESSING') then
      update public.payments set status='CANCELLED' where id=v_payment.id;
      update public.orders set payment_status='CANCELLED',updated_at=now() where id=v_order.id;
    elsif v_payment.status in ('PAID','PARTIALLY_REFUNDED') then
      v_refund_required := true;
    end if;
  end if;

  update public.delivery_incidents set status='COMPLETED',resolution='RETURN_COMPLETED',resolved_by=p_actor_id,resolved_at=now(),updated_at=now() where id=v_incident.id;
  return jsonb_build_object('action','COMPLETE_RETURN','deliveryStatus','DELIVERY_CANCELLED','orderStatus','CANCELLED','orderId',v_order.id,'incidentId',v_incident.id,'refundRequired',v_refund_required,'dispatchRequired',false);
end;
$$;
revoke all on function private.resolve_delivery_incident_atomic(uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.resolve_delivery_incident_atomic(uuid,text,uuid) to service_role;
