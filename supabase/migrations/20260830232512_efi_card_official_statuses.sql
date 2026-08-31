alter table public.efi_card_charges
  drop constraint if exists efi_card_charges_status_check;

alter table public.efi_card_charges
  add constraint efi_card_charges_status_check
  check (status in (
    'CREATED','WAITING','IDENTIFIED','APPROVED','PAID','SETTLED','UNPAID','EXPIRED',
    'CANCELED','CONTESTED','REFUND_PENDING','REFUNDED','ERROR'
  ));

create or replace function public.reconcile_efi_card_charge_atomic(
  p_charge_id bigint,
  p_status text,
  p_payload jsonb default '{}'::jsonb,
  p_paid_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path='public','private'
as $$
declare
  v_charge public.efi_card_charges%rowtype;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_status text := upper(coalesce(p_status,''));
  v_was_paid boolean := false;
begin
  select * into v_charge from public.efi_card_charges where charge_id=p_charge_id for update;
  if not found then raise exception 'EFI_CARD_CHARGE_NOT_FOUND'; end if;
  select * into v_payment from public.payments where id=v_charge.payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into v_order from public.orders where id=v_charge.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  v_was_paid := v_payment.status='PAID';

  if v_payment.status in ('REFUNDED','PARTIALLY_REFUNDED') and v_status not in ('REFUNDED','PARTIALLY_REFUNDED') then
    return v_order.id;
  end if;

  if v_payment.status='PAID' and v_status in ('NEW','WAITING','IDENTIFIED','APPROVED','UNPAID','EXPIRED','CANCELED','CANCELLED') then
    return v_order.id;
  end if;

  if v_status in ('PAID','SETTLED') then
    update public.efi_card_charges
       set status=case when v_status='SETTLED' then 'SETTLED' else 'PAID' end,
           paid_at=coalesce(p_paid_at,paid_at,now()),
           provider_payload=coalesce(p_payload,provider_payload),updated_at=now()
     where id=v_charge.id;
    update public.payments
       set provider='EFI',status='PAID',provider_transaction_id=p_charge_id::text,
           paid_at=coalesce(p_paid_at,paid_at,now())
     where id=v_payment.id;
    update public.orders
       set payment_status='PAID',status=case when status='PENDING_PAYMENT' then 'WAITING_STORE' else status end,updated_at=now()
     where id=v_order.id;
    if v_order.status='PENDING_PAYMENT' then
      insert into public.order_status_history(order_id,status,changed_by,reason)
      values(v_order.id,'WAITING_STORE',null,case when v_status='SETTLED' then 'Pagamento por cartão liquidado pela Efí' else 'Pagamento por cartão confirmado pela Efí' end);
    end if;
    if not v_was_paid and v_order.customer_id is not null then
      insert into public.notifications(user_id,notification_type,title,body,data)
      values(v_order.customer_id,'PAYMENT_CONFIRMED','Pagamento confirmado','Seu pagamento por cartão foi confirmado. O pedido foi enviado para a loja.',jsonb_build_object('orderId',v_order.id,'chargeId',p_charge_id,'providerStatus',v_status));
    end if;

  elsif v_status in ('APPROVED','IDENTIFIED','WAITING','NEW') then
    update public.efi_card_charges
       set status=case when v_status='APPROVED' then 'APPROVED' when v_status='IDENTIFIED' then 'IDENTIFIED' else 'WAITING' end,
           provider_payload=coalesce(p_payload,provider_payload),updated_at=now()
     where id=v_charge.id;
    update public.payments
       set provider='EFI',status='PROCESSING',provider_transaction_id=p_charge_id::text
     where id=v_payment.id and status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');

  elsif v_status in ('UNPAID','EXPIRED') then
    update public.efi_card_charges
       set status=case when v_status='EXPIRED' then 'EXPIRED' else 'UNPAID' end,
           provider_payload=coalesce(p_payload,provider_payload),updated_at=now()
     where id=v_charge.id;
    update public.payments
       set provider='EFI',status='FAILED',provider_transaction_id=p_charge_id::text
     where id=v_payment.id and status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');
    if v_order.status='PENDING_PAYMENT' then
      update public.orders set status='PAYMENT_FAILED',payment_status='FAILED',updated_at=now() where id=v_order.id;
      insert into public.order_status_history(order_id,status,changed_by,reason)
      values(v_order.id,'PAYMENT_FAILED',null,case when v_status='EXPIRED' then 'Cobrança de cartão expirada na Efí' else 'Pagamento por cartão não aprovado pela Efí' end);
    end if;

  elsif v_status in ('CANCELED','CANCELLED') then
    update public.efi_card_charges set status='CANCELED',provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
    update public.payments set provider='EFI',status='CANCELLED',provider_transaction_id=p_charge_id::text where id=v_payment.id and status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');
    if v_order.status='PENDING_PAYMENT' then
      update public.orders set status='CANCELLED',payment_status='CANCELLED',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=v_order.id;
      insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'CANCELLED',null,'Cobrança de cartão cancelada na Efí');
    end if;

  elsif v_status='CONTESTED' then
    update public.efi_card_charges set status='CONTESTED',provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
    if v_charge.status<>'CONTESTED' then
      insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
      values(null,'EFI_CARD_CONTESTED','efi_card_charge',v_charge.id,jsonb_build_object('orderId',v_order.id,'chargeId',p_charge_id,'paymentId',v_payment.id));

      if v_order.customer_id is not null then
        insert into public.notifications(user_id,notification_type,title,body,data)
        values(v_order.customer_id,'PAYMENT_CONTESTED','Pagamento em contestação','A operadora informou uma contestação no pagamento por cartão deste pedido.',jsonb_build_object('orderId',v_order.id,'chargeId',p_charge_id));
      end if;

      insert into public.notifications(user_id,notification_type,title,body,data)
      select distinct sm.user_id,'PAYMENT_CONTESTED','Contestação de cartão','A Efí informou uma contestação de pagamento em um pedido da loja.',jsonb_build_object('orderId',v_order.id,'chargeId',p_charge_id)
      from public.store_memberships sm
      where sm.store_id=v_order.store_id and sm.active=true and sm.role in ('OWNER','MANAGER');
    end if;

  elsif v_status='REFUNDED' then
    update public.efi_card_charges set status='REFUNDED',refunded_at=coalesce(refunded_at,now()),provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
    update public.payments set provider='EFI',status='REFUNDED',provider_transaction_id=p_charge_id::text where id=v_payment.id;
    update public.orders set payment_status='REFUNDED',status=case when status in ('CANCELLED','REJECTED','DELIVERED') then 'REFUNDED' else status end,updated_at=now() where id=v_order.id;
  end if;

  return v_order.id;
end;
$$;

revoke all on function public.reconcile_efi_card_charge_atomic(bigint,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.reconcile_efi_card_charge_atomic(bigint,text,jsonb,timestamptz) to service_role;
