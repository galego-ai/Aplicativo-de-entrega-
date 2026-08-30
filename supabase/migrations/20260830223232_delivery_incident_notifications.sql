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
  v_priority text;
  v_subject text;
  v_customer_title text;
  v_customer_body text;
begin
  if old.status is not distinct from new.status or new.status not in ('CUSTOMER_UNAVAILABLE','RETURN_REQUIRED','INCIDENT') then
    return new;
  end if;

  select d.user_id into v_driver_user from public.drivers d where d.id = new.driver_id;
  select o.store_id,o.customer_id into v_store_id,v_customer_id from public.orders o where o.id = new.order_id;
  if v_driver_user is null then return new; end if;

  select st.id into v_ticket_id
  from public.support_tickets st
  where st.delivery_id = new.id
    and st.category = 'DELIVERY_INCIDENT'
    and st.status in ('OPEN','IN_PROGRESS','WAITING_USER')
  order by st.created_at desc
  limit 1;

  if v_ticket_id is null then
    v_priority := case new.status when 'INCIDENT' then 'CRITICAL' when 'RETURN_REQUIRED' then 'HIGH' else 'NORMAL' end;
    v_subject := case new.status
      when 'CUSTOMER_UNAVAILABLE' then 'Cliente não localizado na entrega'
      when 'RETURN_REQUIRED' then 'Retorno do pedido à loja necessário'
      else 'Incidente durante a entrega'
    end;

    insert into public.support_tickets(opened_by,store_id,order_id,delivery_id,category,priority,status,subject)
    values(v_driver_user,v_store_id,new.order_id,new.id,'DELIVERY_INCIDENT',v_priority,'OPEN',v_subject)
    returning id into v_ticket_id;

    insert into public.support_messages(ticket_id,sender_id,body)
    values(v_ticket_id,v_driver_user,
      case new.status
        when 'CUSTOMER_UNAVAILABLE' then 'O entregador informou que não conseguiu localizar o cliente no endereço de entrega.'
        when 'RETURN_REQUIRED' then 'A entrega foi marcada como retorno necessário para a loja.'
        else 'O entregador reportou um incidente durante a entrega. A operação precisa de acompanhamento.'
      end);
  end if;

  if v_customer_id is not null then
    v_customer_title := case new.status when 'CUSTOMER_UNAVAILABLE' then 'Entregador aguardando você' else 'Entrega em atendimento' end;
    v_customer_body := case new.status
      when 'CUSTOMER_UNAVAILABLE' then 'O entregador informou que não conseguiu localizar você. Abra o app e acompanhe o suporte.'
      when 'RETURN_REQUIRED' then 'Sua entrega precisa de atendimento operacional. O suporte foi acionado.'
      else 'O suporte foi acionado para acompanhar um incidente na sua entrega.'
    end;
    insert into public.notifications(user_id,notification_type,title,body,data)
    values(v_customer_id,'DELIVERY_INCIDENT',v_customer_title,v_customer_body,jsonb_build_object('orderId',new.order_id,'deliveryId',new.id,'deliveryStatus',new.status,'ticketId',v_ticket_id));
  end if;

  insert into public.notifications(user_id,notification_type,title,body,data)
  select sm.user_id,'DELIVERY_INCIDENT','Atenção na entrega',v_subject,jsonb_build_object('orderId',new.order_id,'deliveryId',new.id,'deliveryStatus',new.status,'ticketId',v_ticket_id)
  from public.store_memberships sm
  where sm.store_id=v_store_id and sm.active=true;

  return new;
end;
$$;

revoke all on function private.ensure_delivery_incident_support_ticket() from public, anon, authenticated;
