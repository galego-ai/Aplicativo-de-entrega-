create table if not exists public.delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  incident_type text not null check (incident_type in ('INCIDENT','CUSTOMER_UNAVAILABLE','RETURN_REQUIRED')),
  previous_status text not null,
  status text not null default 'OPEN' check (status in ('OPEN','RETURN_REQUIRED','RESOLVED','COMPLETED','CANCELLED')),
  resolution text,
  resolved_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.delivery_incidents enable row level security;
revoke all on table public.delivery_incidents from anon, authenticated;
create index if not exists delivery_incidents_delivery_idx on public.delivery_incidents(delivery_id, opened_at desc);
create index if not exists delivery_incidents_ticket_idx on public.delivery_incidents(ticket_id) where ticket_id is not null;
create unique index if not exists delivery_incidents_one_active_idx on public.delivery_incidents(delivery_id) where status in ('OPEN','RETURN_REQUIRED');

create or replace function private.ensure_delivery_incident_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_user uuid;
  v_store_id uuid;
  v_customer_id uuid;
  v_ticket_id uuid;
  v_incident_id uuid;
  v_priority text;
  v_subject text;
  v_customer_title text;
  v_customer_body text;
begin
  if old.status is not distinct from new.status or new.status not in ('CUSTOMER_UNAVAILABLE','RETURN_REQUIRED','INCIDENT') then return new; end if;
  select d.user_id into v_driver_user from public.drivers d where d.id = new.driver_id;
  select o.store_id,o.customer_id into v_store_id,v_customer_id from public.orders o where o.id = new.order_id;
  if v_driver_user is null then return new; end if;

  select st.id into v_ticket_id from public.support_tickets st
   where st.delivery_id=new.id and st.category='DELIVERY_INCIDENT' and st.status in ('OPEN','IN_PROGRESS','WAITING_USER')
   order by st.created_at desc limit 1;

  if v_ticket_id is null then
    v_priority:=case new.status when 'INCIDENT' then 'CRITICAL' when 'RETURN_REQUIRED' then 'HIGH' else 'NORMAL' end;
    v_subject:=case new.status when 'CUSTOMER_UNAVAILABLE' then 'Cliente não localizado na entrega' when 'RETURN_REQUIRED' then 'Retorno do pedido à loja necessário' else 'Incidente durante a entrega' end;
    insert into public.support_tickets(opened_by,store_id,order_id,delivery_id,category,priority,status,subject)
    values(v_driver_user,v_store_id,new.order_id,new.id,'DELIVERY_INCIDENT',v_priority,'OPEN',v_subject) returning id into v_ticket_id;
    insert into public.support_messages(ticket_id,sender_id,body) values(v_ticket_id,v_driver_user,
      case new.status when 'CUSTOMER_UNAVAILABLE' then 'O entregador informou que não conseguiu localizar o cliente no endereço de entrega.' when 'RETURN_REQUIRED' then 'A entrega foi marcada como retorno necessário para a loja.' else 'O entregador reportou um incidente durante a entrega. A operação precisa de acompanhamento.' end);
  end if;

  select di.id into v_incident_id from public.delivery_incidents di
   where di.delivery_id=new.id and di.status in ('OPEN','RETURN_REQUIRED') order by di.opened_at desc limit 1;
  if v_incident_id is null then
    insert into public.delivery_incidents(delivery_id,order_id,driver_id,ticket_id,incident_type,previous_status,status)
    values(new.id,new.order_id,new.driver_id,v_ticket_id,new.status,old.status,case when new.status='RETURN_REQUIRED' then 'RETURN_REQUIRED' else 'OPEN' end)
    returning id into v_incident_id;
  else
    update public.delivery_incidents set ticket_id=coalesce(ticket_id,v_ticket_id),incident_type=case when new.status='RETURN_REQUIRED' then incident_type else new.status end,status=case when new.status='RETURN_REQUIRED' then 'RETURN_REQUIRED' else status end,updated_at=now() where id=v_incident_id;
  end if;

  if v_customer_id is not null then
    v_customer_title:=case new.status when 'CUSTOMER_UNAVAILABLE' then 'Entregador aguardando você' else 'Entrega em atendimento' end;
    v_customer_body:=case new.status when 'CUSTOMER_UNAVAILABLE' then 'O entregador informou que não conseguiu localizar você. Abra o app e acompanhe o suporte.' when 'RETURN_REQUIRED' then 'Sua entrega precisa de atendimento operacional. O suporte foi acionado.' else 'O suporte foi acionado para acompanhar um incidente na sua entrega.' end;
    insert into public.notifications(user_id,notification_type,title,body,data)
    values(v_customer_id,'DELIVERY_INCIDENT',v_customer_title,v_customer_body,jsonb_build_object('orderId',new.order_id,'deliveryId',new.id,'deliveryStatus',new.status,'ticketId',v_ticket_id,'incidentId',v_incident_id));
  end if;

  insert into public.notifications(user_id,notification_type,title,body,data)
  select sm.user_id,'DELIVERY_INCIDENT','Atenção na entrega',case new.status when 'CUSTOMER_UNAVAILABLE' then 'Cliente não localizado na entrega' when 'RETURN_REQUIRED' then 'Retorno do pedido à loja necessário' else 'Incidente durante a entrega' end,jsonb_build_object('orderId',new.order_id,'deliveryId',new.id,'deliveryStatus',new.status,'ticketId',v_ticket_id,'incidentId',v_incident_id)
  from public.store_memberships sm where sm.store_id=v_store_id and sm.active=true;
  return new;
end;
$$;
revoke all on function private.ensure_delivery_incident_support_ticket() from public, anon, authenticated;

create or replace function private.resolve_delivery_incident_atomic(p_delivery_id uuid,p_action text,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_delivery public.deliveries%rowtype; v_order public.orders%rowtype; v_incident public.delivery_incidents%rowtype; v_target text; v_payment public.payments%rowtype;
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
  if found and v_payment.status in ('PENDING','PROCESSING') then update public.payments set status='CANCELLED' where id=v_payment.id; update public.orders set payment_status='CANCELLED',updated_at=now() where id=v_order.id; end if;
  update public.delivery_incidents set status='COMPLETED',resolution='RETURN_COMPLETED',resolved_by=p_actor_id,resolved_at=now(),updated_at=now() where id=v_incident.id;
  return jsonb_build_object('action','COMPLETE_RETURN','deliveryStatus','DELIVERY_CANCELLED','orderStatus','CANCELLED','orderId',v_order.id,'incidentId',v_incident.id,'refundRequired',found and v_payment.status='PAID','dispatchRequired',false);
end;
$$;
revoke all on function private.resolve_delivery_incident_atomic(uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.resolve_delivery_incident_atomic(uuid,text,uuid) to service_role;
