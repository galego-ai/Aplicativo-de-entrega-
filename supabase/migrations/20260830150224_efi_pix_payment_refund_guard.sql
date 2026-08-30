create or replace function public.complete_efi_pix_payment_atomic(p_txid text, p_end_to_end_id text, p_paid_amount numeric, p_paid_at timestamptz, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_charge public.efi_pix_charges%rowtype;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
begin
  select * into v_charge from public.efi_pix_charges where txid = p_txid for update;
  if not found then raise exception 'EFI_PIX_CHARGE_NOT_FOUND'; end if;
  select * into v_payment from public.payments where id = v_charge.payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_charge.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_payment.status in ('REFUNDED','PARTIALLY_REFUNDED') or v_charge.status in ('REFUNDED','PARTIALLY_REFUNDED') then return v_order.id; end if;
  if v_charge.status='PAID' and v_payment.status='PAID' then return v_order.id; end if;
  if round(p_paid_amount,2) <> round(v_payment.amount,2) then raise exception 'EFI_PIX_AMOUNT_MISMATCH'; end if;

  update public.efi_pix_charges
    set status='PAID',end_to_end_id=p_end_to_end_id,paid_amount=p_paid_amount,paid_at=coalesce(p_paid_at,now()),provider_payload=p_payload,updated_at=now()
    where id=v_charge.id;
  update public.payments set provider='EFI',status='PAID',provider_transaction_id=p_txid,paid_at=coalesce(p_paid_at,now()) where id=v_payment.id;
  update public.orders set payment_status='PAID',status=case when status='PENDING_PAYMENT' then 'WAITING_STORE' else status end,updated_at=now() where id=v_order.id;

  if v_order.status='PENDING_PAYMENT' then
    insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'WAITING_STORE',null,'Pagamento PIX confirmado pela Efí');
  end if;
  if v_order.customer_id is not null then
    insert into public.notifications(user_id,notification_type,title,body,data)
    values(v_order.customer_id,'PAYMENT_CONFIRMED','Pagamento confirmado','Seu PIX foi confirmado. O pedido foi enviado para a loja.',jsonb_build_object('orderId',v_order.id,'txid',p_txid));
  end if;
  return v_order.id;
end;
$$;

revoke all on function public.complete_efi_pix_payment_atomic(text,text,numeric,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.complete_efi_pix_payment_atomic(text,text,numeric,timestamptz,jsonb) to service_role;
