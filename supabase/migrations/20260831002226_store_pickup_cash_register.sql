create or replace function public.complete_store_pickup_atomic(
  p_order_id uuid,
  p_actor_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path='public','private'
as $$
declare
  v_order public.orders%rowtype;
  v_cash_payment public.payments%rowtype;
  v_has_paid_payment boolean:=false;
  v_cash_session_id uuid;
begin
  select * into v_order
    from public.orders
   where id=p_order_id
   for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.delivery_type<>'PICKUP' then raise exception 'ORDER_NOT_PICKUP'; end if;
  if v_order.status<>'READY' then raise exception 'ORDER_NOT_READY'; end if;

  select * into v_cash_payment
    from public.payments
   where order_id=v_order.id and method='CASH'
   order by created_at desc
   limit 1
   for update;

  select exists(
    select 1 from public.payments p
     where p.order_id=v_order.id and p.status='PAID'
  ) into v_has_paid_payment;

  if not v_has_paid_payment then
    if v_cash_payment.id is null then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;
    if v_cash_payment.status not in ('PENDING','PROCESSING','PAID') then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;
    if v_cash_payment.status<>'PAID' then
      update public.payments
         set status='PAID',paid_at=coalesce(paid_at,now())
       where id=v_cash_payment.id;
    end if;
  end if;

  if v_cash_payment.id is not null and p_actor_id is not null then
    select cs.id into v_cash_session_id
      from public.cash_sessions cs
      join public.cash_registers cr on cr.id=cs.cash_register_id
     where cr.store_id=v_order.store_id and cs.status='OPEN'
     order by cs.opened_at desc
     limit 1
     for update of cs;

    if v_cash_session_id is not null and not exists(
      select 1 from public.cash_transactions ct
       where ct.cash_session_id=v_cash_session_id
         and ct.transaction_type='SALE'
         and ct.payment_method='CASH'
         and ct.reference_id=v_order.id
    ) then
      insert into public.cash_transactions(cash_session_id,transaction_type,amount,payment_method,reference_id,reason,created_by)
      values(v_cash_session_id,'SALE',v_cash_payment.amount,'CASH',v_order.id,'Retirada na loja paga em dinheiro',p_actor_id);
    end if;
  end if;

  update public.orders
     set status='DELIVERED',payment_status='PAID',delivered_at=coalesce(delivered_at,now()),updated_at=now()
   where id=v_order.id
   returning * into v_order;

  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(v_order.id,'DELIVERED',p_actor_id,'Retirada na loja confirmada');

  return v_order;
end;
$$;

revoke all on function public.complete_store_pickup_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_store_pickup_atomic(uuid,uuid) to service_role;
