create table if not exists public.efi_card_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  charge_id bigint unique,
  status text not null default 'CREATED' check (status in ('CREATED','WAITING','APPROVED','PAID','UNPAID','CANCELED','REFUND_PENDING','REFUNDED','ERROR')),
  card_mask text,
  brand text,
  installments integer not null default 1 check (installments between 1 and 24),
  installment_value numeric(14,2),
  amount numeric(14,2) not null check (amount >= 0),
  refusal_reason text,
  retry_allowed boolean,
  provider_payload jsonb,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payment_id),
  unique(order_id)
);
create index if not exists idx_efi_card_charges_status on public.efi_card_charges(status,updated_at);
alter table public.efi_card_charges enable row level security;
drop policy if exists efi_card_charges_read_scope on public.efi_card_charges;
create policy efi_card_charges_read_scope on public.efi_card_charges for select to authenticated using (
  exists(select 1 from public.orders o where o.id=efi_card_charges.order_id and (o.customer_id=(select auth.uid()) or private.is_store_member(o.store_id) or private.is_admin()))
);

create or replace function public.reconcile_efi_card_charge_atomic(p_charge_id bigint,p_status text,p_payload jsonb default '{}'::jsonb,p_paid_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_charge public.efi_card_charges%rowtype;v_payment public.payments%rowtype;v_order public.orders%rowtype;v_status text:=upper(coalesce(p_status,''));
begin
 select * into v_charge from public.efi_card_charges where charge_id=p_charge_id for update;if not found then raise exception 'EFI_CARD_CHARGE_NOT_FOUND';end if;
 select * into v_payment from public.payments where id=v_charge.payment_id for update;if not found then raise exception 'PAYMENT_NOT_FOUND';end if;
 select * into v_order from public.orders where id=v_charge.order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if v_payment.status in ('REFUNDED','PARTIALLY_REFUNDED') and v_status not in ('REFUNDED','PARTIALLY_REFUNDED') then return v_order.id;end if;
 if v_status='PAID' then
  update public.efi_card_charges set status='PAID',paid_at=coalesce(p_paid_at,paid_at,now()),provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
  update public.payments set provider='EFI',status='PAID',provider_transaction_id=p_charge_id::text,paid_at=coalesce(p_paid_at,paid_at,now()) where id=v_payment.id;
  update public.orders set payment_status='PAID',status=case when status='PENDING_PAYMENT' then 'WAITING_STORE' else status end,updated_at=now() where id=v_order.id;
  if v_order.status='PENDING_PAYMENT' then insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'WAITING_STORE',null,'Pagamento por cartão confirmado pela Efí');end if;
  if v_order.customer_id is not null then insert into public.notifications(user_id,notification_type,title,body,data) values(v_order.customer_id,'PAYMENT_CONFIRMED','Pagamento confirmado','Seu pagamento por cartão foi confirmado. O pedido foi enviado para a loja.',jsonb_build_object('orderId',v_order.id,'chargeId',p_charge_id));end if;
 elsif v_status in ('APPROVED','WAITING','NEW') then
  update public.efi_card_charges set status=case when v_status='APPROVED' then 'APPROVED' else 'WAITING' end,provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
  update public.payments set provider='EFI',status='PROCESSING',provider_transaction_id=p_charge_id::text where id=v_payment.id and status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');
 elsif v_status='UNPAID' then
  update public.efi_card_charges set status='UNPAID',provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
  update public.payments set provider='EFI',status='FAILED',provider_transaction_id=p_charge_id::text where id=v_payment.id and status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');
  if v_order.status='PENDING_PAYMENT' then update public.orders set status='PAYMENT_FAILED',payment_status='FAILED',updated_at=now() where id=v_order.id;insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'PAYMENT_FAILED',null,'Pagamento por cartão não aprovado pela Efí');end if;
 elsif v_status in ('CANCELED','CANCELLED') then
  update public.efi_card_charges set status='CANCELED',provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
  update public.payments set provider='EFI',status='CANCELLED',provider_transaction_id=p_charge_id::text where id=v_payment.id and status not in ('PAID','REFUNDED','PARTIALLY_REFUNDED');
  if v_order.status='PENDING_PAYMENT' then update public.orders set status='CANCELLED',payment_status='CANCELLED',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=v_order.id;insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'CANCELLED',null,'Cobrança de cartão cancelada na Efí');end if;
 elsif v_status='REFUNDED' then
  update public.efi_card_charges set status='REFUNDED',refunded_at=coalesce(refunded_at,now()),provider_payload=coalesce(p_payload,provider_payload),updated_at=now() where id=v_charge.id;
  update public.payments set provider='EFI',status='REFUNDED',provider_transaction_id=p_charge_id::text where id=v_payment.id;
  update public.orders set payment_status='REFUNDED',status=case when status in ('CANCELLED','REJECTED','DELIVERED') then 'REFUNDED' else status end,updated_at=now() where id=v_order.id;
 end if;
 return v_order.id;
end;$$;
revoke all on function public.reconcile_efi_card_charge_atomic(bigint,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.reconcile_efi_card_charge_atomic(bigint,text,jsonb,timestamptz) to service_role;

create or replace function public.complete_efi_card_refund_atomic(p_charge_id bigint,p_provider_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='public','private' as $$
declare v_charge public.efi_card_charges%rowtype;v_payment public.payments%rowtype;v_order public.orders%rowtype;v_refund public.refunds%rowtype;
begin
 select * into v_charge from public.efi_card_charges where charge_id=p_charge_id for update;if not found then raise exception 'EFI_CARD_CHARGE_NOT_FOUND';end if;
 select * into v_payment from public.payments where id=v_charge.payment_id for update;select * into v_order from public.orders where id=v_charge.order_id for update;
 select * into v_refund from public.refunds where payment_id=v_payment.id and status in ('PENDING','PROCESSING') order by created_at desc limit 1 for update;
 if found then update public.refunds set status='COMPLETED',completed_at=coalesce(completed_at,now()) where id=v_refund.id;end if;
 update public.efi_card_charges set status='REFUNDED',refunded_at=coalesce(refunded_at,now()),provider_payload=coalesce(p_provider_payload,provider_payload),updated_at=now() where id=v_charge.id;
 update public.payments set status='REFUNDED' where id=v_payment.id;
 update public.orders set payment_status='REFUNDED',status=case when status in ('CANCELLED','REJECTED','DELIVERED') then 'REFUNDED' else status end,updated_at=now() where id=v_order.id;
 if v_order.customer_id is not null then insert into public.notifications(user_id,notification_type,title,body,data) values(v_order.customer_id,'REFUND_COMPLETED','Estorno concluído','O estorno do pagamento por cartão foi concluído.',jsonb_build_object('orderId',v_order.id,'chargeId',p_charge_id));end if;
 return v_order.id;
end;$$;
revoke all on function public.complete_efi_card_refund_atomic(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.complete_efi_card_refund_atomic(bigint,jsonb) to service_role;
