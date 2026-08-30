create or replace function private.ensure_delivery_incident_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_user uuid;
  v_store_id uuid;
  v_ticket_id uuid;
  v_priority text;
  v_subject text;
begin
  if old.status is not distinct from new.status or new.status not in ('CUSTOMER_UNAVAILABLE','RETURN_REQUIRED','INCIDENT') then
    return new;
  end if;

  select d.user_id into v_driver_user from public.drivers d where d.id = new.driver_id;
  select o.store_id into v_store_id from public.orders o where o.id = new.order_id;
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

  return new;
end;
$$;

revoke all on function private.ensure_delivery_incident_support_ticket() from public, anon, authenticated;

drop trigger if exists deliveries_open_support_on_incident on public.deliveries;
create trigger deliveries_open_support_on_incident
after update of status on public.deliveries
for each row execute function private.ensure_delivery_incident_support_ticket();
