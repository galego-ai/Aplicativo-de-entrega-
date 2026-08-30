create table if not exists public.efi_pix_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  txid text not null unique,
  location_id bigint,
  location_url text,
  brcode text,
  qr_image text,
  visualization_url text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAID','EXPIRED','CANCELLED','ERROR')),
  amount numeric(14,2) not null check (amount >= 0),
  expires_at timestamptz not null,
  end_to_end_id text,
  paid_amount numeric(14,2),
  paid_at timestamptz,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_efi_pix_charges_order on public.efi_pix_charges(order_id, created_at desc);
create index if not exists idx_efi_pix_charges_payment on public.efi_pix_charges(payment_id, created_at desc);
create index if not exists idx_efi_pix_charges_status_expiry on public.efi_pix_charges(status, expires_at);
alter table public.efi_pix_charges enable row level security;
revoke all on public.efi_pix_charges from anon, authenticated;
grant select on public.efi_pix_charges to authenticated;
create policy efi_pix_charges_customer_read on public.efi_pix_charges for select to authenticated using (exists (select 1 from public.orders o where o.id=efi_pix_charges.order_id and o.customer_id=auth.uid()));
create policy efi_pix_charges_store_read on public.efi_pix_charges for select to authenticated using (exists (select 1 from public.orders o join public.store_memberships sm on sm.store_id=o.store_id where o.id=efi_pix_charges.order_id and sm.user_id=auth.uid() and sm.active=true));
create policy efi_pix_charges_admin_read on public.efi_pix_charges for select to authenticated using (private.is_admin());
create or replace function private.touch_efi_pix_charge_updated_at() returns trigger language plpgsql set search_path=public,private as $$begin new.updated_at:=now();return new;end$$;
drop trigger if exists trg_efi_pix_charge_touch on public.efi_pix_charges;
create trigger trg_efi_pix_charge_touch before update on public.efi_pix_charges for each row execute function private.touch_efi_pix_charge_updated_at();
create or replace function public.complete_efi_pix_payment_atomic(p_txid text,p_end_to_end_id text,p_paid_amount numeric,p_paid_at timestamptz,p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,private as $$
declare v_charge public.efi_pix_charges%rowtype;v_payment public.payments%rowtype;v_order public.orders%rowtype;
begin
 select * into v_charge from public.efi_pix_charges where txid=p_txid for update;if not found then raise exception 'EFI_PIX_CHARGE_NOT_FOUND';end if;
 select * into v_payment from public.payments where id=v_charge.payment_id for update;if not found then raise exception 'PAYMENT_NOT_FOUND';end if;
 select * into v_order from public.orders where id=v_charge.order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if v_charge.status='PAID' and v_payment.status='PAID' then return v_order.id;end if;
 if round(p_paid_amount,2)<>round(v_payment.amount,2) then raise exception 'EFI_PIX_AMOUNT_MISMATCH';end if;
 update public.efi_pix_charges set status='PAID',end_to_end_id=p_end_to_end_id,paid_amount=p_paid_amount,paid_at=coalesce(p_paid_at,now()),provider_payload=p_payload where id=v_charge.id;
 update public.payments set provider='EFI',status='PAID',provider_transaction_id=p_txid,paid_at=coalesce(p_paid_at,now()) where id=v_payment.id;
 update public.orders set payment_status='PAID',status=case when status='PENDING_PAYMENT' then 'WAITING_STORE' else status end,updated_at=now() where id=v_order.id;
 if v_order.status='PENDING_PAYMENT' then insert into public.order_status_history(order_id,status,changed_by,reason) values(v_order.id,'WAITING_STORE',null,'Pagamento PIX confirmado pela Efí');end if;
 if v_order.customer_id is not null then insert into public.notifications(user_id,notification_type,title,body,data) values(v_order.customer_id,'PAYMENT_CONFIRMED','Pagamento confirmado','Seu PIX foi confirmado. O pedido foi enviado para a loja.',jsonb_build_object('orderId',v_order.id,'txid',p_txid));end if;
 return v_order.id;
end$$;
revoke all on function public.complete_efi_pix_payment_atomic(text,text,numeric,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.complete_efi_pix_payment_atomic(text,text,numeric,timestamptz,jsonb) to service_role;
