create or replace function private.ensure_refund_failure_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ticket_id uuid;
  v_actor uuid;
begin
  if new.status <> 'FAILED' or old.status = new.status then
    return new;
  end if;

  select o.* into v_order
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = new.payment_id;

  if not found then return new; end if;
  v_actor := coalesce(new.created_by, v_order.customer_id);
  if v_actor is null then return new; end if;

  select t.id into v_ticket_id
  from public.support_tickets t
  where t.order_id = v_order.id
    and t.category = 'PAYMENT_REFUND'
    and t.status in ('OPEN','IN_PROGRESS','WAITING_USER')
  order by t.created_at desc
  limit 1;

  if v_ticket_id is null then
    insert into public.support_tickets(opened_by,store_id,order_id,category,priority,status,subject)
    values(v_actor,v_order.store_id,v_order.id,'PAYMENT_REFUND','HIGH','OPEN','Falha na devolução PIX Efí')
    returning id into v_ticket_id;

    insert into public.support_messages(ticket_id,sender_id,body)
    values(v_ticket_id,v_actor,'A devolução PIX do pedido #' || v_order.order_number || ' não foi concluída pela Efí. O chamado foi aberto automaticamente para reconciliação financeira.');
  end if;

  return new;
end;
$$;

drop trigger if exists refunds_open_support_on_failure on public.refunds;
create trigger refunds_open_support_on_failure
after update of status on public.refunds
for each row execute function private.ensure_refund_failure_support_ticket();
