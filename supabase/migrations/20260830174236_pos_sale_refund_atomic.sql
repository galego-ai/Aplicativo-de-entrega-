create or replace function private.refund_pos_sale_atomic(
  p_order_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_cash_session_id uuid default null,
  p_external_reversal_confirmed boolean default false
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_payment public.payments;
  v_cash_total numeric := 0;
  v_external_total numeric := 0;
  v_session public.cash_sessions;
  v_register public.cash_registers;
  v_movement public.inventory_movements;
  v_inventory public.inventory_items;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'REFUND_REASON_REQUIRED'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'POS_ORDER_NOT_FOUND'; end if;
  if v_order.source <> 'POS' then raise exception 'NOT_POS_ORDER'; end if;
  if v_order.status='REFUNDED' and v_order.payment_status='REFUNDED' then return v_order; end if;
  if v_order.status <> 'DELIVERED' or v_order.payment_status <> 'PAID' then raise exception 'POS_SALE_NOT_REFUNDABLE'; end if;

  select coalesce(sum(amount) filter (where method='CASH' and status='PAID'),0),
         coalesce(sum(amount) filter (where method<>'CASH' and status='PAID'),0)
    into v_cash_total,v_external_total
    from public.payments where order_id=p_order_id;

  if v_cash_total > 0 then
    if p_cash_session_id is null then raise exception 'CASH_SESSION_REQUIRED'; end if;
    select * into v_session from public.cash_sessions where id=p_cash_session_id for update;
    if not found or v_session.status <> 'OPEN' then raise exception 'CASH_SESSION_REQUIRED'; end if;
    select * into v_register from public.cash_registers where id=v_session.cash_register_id;
    if not found or v_register.store_id <> v_order.store_id then raise exception 'CASH_REGISTER_STORE_MISMATCH'; end if;
  end if;

  if v_external_total > 0 and not p_external_reversal_confirmed then raise exception 'EXTERNAL_REVERSAL_CONFIRMATION_REQUIRED'; end if;

  for v_movement in select * from public.inventory_movements where reference_type='POS_ORDER' and reference_id=p_order_id and movement_type='SALE' order by created_at,id
  loop
    select * into v_inventory from public.inventory_items where store_id=v_order.store_id and product_id=v_movement.product_id for update;
    if not found then raise exception 'INVENTORY_NOT_CONFIGURED'; end if;
    update public.inventory_items set quantity=v_inventory.quantity+abs(v_movement.quantity),updated_at=now() where id=v_inventory.id;
    insert into public.inventory_movements(store_id,product_id,movement_type,quantity,previous_quantity,new_quantity,reference_type,reference_id,reason,created_by)
    values(v_order.store_id,v_movement.product_id,'CANCELLATION',abs(v_movement.quantity),v_inventory.quantity,v_inventory.quantity+abs(v_movement.quantity),'POS_ORDER',p_order_id,'Estoque devolvido por estorno de venda PDV',p_actor_id);
  end loop;

  for v_payment in select * from public.payments where order_id=p_order_id for update
  loop
    if v_payment.status='PAID' and v_payment.amount>0 then
      insert into public.refunds(payment_id,amount,reason,status,created_by,completed_at)
      values(v_payment.id,v_payment.amount,trim(p_reason),'COMPLETED',p_actor_id,now());
      if v_payment.method='CASH' then
        insert into public.cash_transactions(cash_session_id,transaction_type,amount,payment_method,reference_id,reason,created_by)
        values(p_cash_session_id,'REFUND',v_payment.amount,'CASH',p_order_id,trim(p_reason),p_actor_id);
      end if;
    end if;
  end loop;

  update public.payments set status='REFUNDED' where order_id=p_order_id and status='PAID';
  insert into public.financial_transactions(store_id,order_id,transaction_type,direction,amount,status)
  values(v_order.store_id,p_order_id,'REFUND','DEBIT',v_order.total,'POSTED');
  update public.orders set status='REFUNDED',payment_status='REFUNDED',updated_at=now() where id=p_order_id returning * into v_order;
  insert into public.order_status_history(order_id,status,changed_by,reason) values(p_order_id,'REFUNDED',p_actor_id,trim(p_reason));
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor_id,'POS_SALE_REFUNDED','order',p_order_id,jsonb_build_object('status','DELIVERED','payment_status','PAID','total',v_order.total),jsonb_build_object('status','REFUNDED','payment_status','REFUNDED','cash_refund',v_cash_total,'external_refund',v_external_total,'reason',trim(p_reason)));
  return v_order;
end;
$$;

revoke all on function private.refund_pos_sale_atomic(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function private.refund_pos_sale_atomic(uuid,uuid,text,uuid,boolean) to service_role;