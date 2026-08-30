create or replace function public.settle_efi_pix_refund_atomic(
  p_provider_refund_id text,
  p_provider_status text,
  p_provider_payload jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_refund public.refunds%rowtype;
  v_payment public.payments%rowtype;
  v_charge public.efi_pix_charges%rowtype;
  v_order public.orders%rowtype;
  v_completed numeric := 0;
  v_payment_status text;
  v_was_completed boolean := false;
begin
  select * into v_refund from public.refunds where provider_refund_id = p_provider_refund_id for update;
  if not found then raise exception 'EFI_REFUND_NOT_FOUND'; end if;
  select * into v_payment from public.payments where id = v_refund.payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_payment.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into v_charge from public.efi_pix_charges where payment_id = v_payment.id for update;
  if not found then raise exception 'EFI_PIX_CHARGE_NOT_FOUND'; end if;

  v_was_completed := v_refund.status = 'COMPLETED';
  if p_provider_status = 'DEVOLVIDO' then
    if not v_was_completed then
      update public.refunds set status='COMPLETED', completed_at=coalesce(completed_at,now()) where id=v_refund.id;
    end if;
    select coalesce(sum(amount),0) into v_completed from public.refunds where payment_id=v_payment.id and status='COMPLETED';
    v_payment_status := case when round(v_completed,2) >= round(v_payment.amount,2) then 'REFUNDED' else 'PARTIALLY_REFUNDED' end;
    update public.payments set status=v_payment_status where id=v_payment.id;
    update public.orders set payment_status=v_payment_status, updated_at=now() where id=v_order.id;
    update public.efi_pix_charges
      set status=v_payment_status,
          provider_payload=coalesce(provider_payload,'{}'::jsonb) || jsonb_build_object('lastRefund',coalesce(p_provider_payload,'{}'::jsonb)),
          updated_at=now()
      where id=v_charge.id;
    if not v_was_completed and v_order.customer_id is not null then
      insert into public.notifications(user_id,notification_type,title,body,data)
      values(v_order.customer_id,'PAYMENT_REFUNDED','PIX devolvido',
        case when v_payment_status='REFUNDED' then 'O valor do seu pedido foi devolvido via PIX.' else 'Uma parte do valor do seu pedido foi devolvida via PIX.' end,
        jsonb_build_object('orderId',v_order.id,'refundId',v_refund.id,'amount',v_refund.amount));
    end if;
  elsif p_provider_status = 'NAO_REALIZADO' then
    update public.refunds set status='FAILED' where id=v_refund.id and status <> 'COMPLETED';
    v_payment_status := v_payment.status;
  else
    update public.refunds set status='PROCESSING' where id=v_refund.id and status not in ('COMPLETED','FAILED','CANCELLED');
    v_payment_status := v_payment.status;
  end if;

  return jsonb_build_object(
    'refundId',v_refund.id,'orderId',v_order.id,'paymentId',v_payment.id,
    'providerRefundId',p_provider_refund_id,
    'refundStatus',case when p_provider_status='DEVOLVIDO' then 'COMPLETED' when p_provider_status='NAO_REALIZADO' then 'FAILED' else 'PROCESSING' end,
    'paymentStatus',v_payment_status);
end;
$$;

revoke all on function public.settle_efi_pix_refund_atomic(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.settle_efi_pix_refund_atomic(text,text,jsonb) to service_role;
