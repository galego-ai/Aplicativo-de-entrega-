create or replace function private.driver_available_balance(p_driver_id uuid)
returns numeric
language sql
security definer
set search_path to ''
as $$
  select coalesce(sum(
    case
      when ft.transaction_type='DRIVER_EARNING' then ft.amount
      when ft.transaction_type='REFUND' then case when ft.direction='CREDIT' then -ft.amount else ft.amount end
      when ft.direction='CREDIT' then ft.amount
      else -ft.amount
    end
  ),0)
  from public.financial_transactions ft
  where ft.driver_id=p_driver_id
    and ft.status in ('POSTED','PENDING');
$$;
revoke all on function private.driver_available_balance(uuid) from public, anon, authenticated;
grant execute on function private.driver_available_balance(uuid) to service_role;

create or replace function private.request_driver_payout_atomic(
  p_driver_id uuid,p_user_id uuid,p_amount numeric,p_method text,p_destination_value text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_available numeric:=0;v_payout_id uuid;
begin
  if p_amount is null or p_amount<=0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('PIX','BANK_TRANSFER','OTHER') then raise exception 'INVALID_METHOD'; end if;
  if nullif(trim(p_destination_value),'') is null then raise exception 'DESTINATION_REQUIRED'; end if;
  if not exists(select 1 from public.drivers d where d.id=p_driver_id and d.user_id=p_user_id) then raise exception 'DRIVER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_driver_id::text,1));
  v_available:=private.driver_available_balance(p_driver_id);
  if p_amount>v_available then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
  insert into public.payouts(recipient_type,store_id,driver_id,amount,method,status,destination_value,requested_by)
  values('DRIVER',null,p_driver_id,p_amount,p_method,'REQUESTED',trim(p_destination_value),p_user_id)
  returning id into v_payout_id;
  insert into public.financial_transactions(driver_id,transaction_type,direction,amount,status,payout_id)
  values(p_driver_id,'PAYOUT','DEBIT',p_amount,'PENDING',v_payout_id);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(p_user_id,'DRIVER_PAYOUT_REQUESTED','payout',v_payout_id,jsonb_build_object('driver_id',p_driver_id,'amount',p_amount,'method',p_method));
  return v_payout_id;
end;
$$;

create or replace function private.review_driver_payout_atomic(
  p_payout_id uuid,p_target_status text,p_actor_id uuid,p_notes text default null,p_provider_id text default null
)
returns public.payouts
language plpgsql
security definer
set search_path to ''
as $$
declare v_payout public.payouts;v_available numeric:=0;
begin
  select * into v_payout from public.payouts where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_payout.recipient_type<>'DRIVER' then raise exception 'INVALID_RECIPIENT'; end if;
  if not (
    (v_payout.status='REQUESTED' and p_target_status in ('APPROVED','REJECTED','CANCELLED')) or
    (v_payout.status='APPROVED' and p_target_status in ('PROCESSING','PAID','REJECTED')) or
    (v_payout.status='PROCESSING' and p_target_status in ('PAID','FAILED')) or
    (v_payout.status='FAILED' and p_target_status in ('PROCESSING','CANCELLED'))
  ) then raise exception 'INVALID_PAYOUT_TRANSITION'; end if;
  if v_payout.status='FAILED' and p_target_status='PROCESSING' then
    perform pg_advisory_xact_lock(hashtextextended(v_payout.driver_id::text,1));
    v_available:=private.driver_available_balance(v_payout.driver_id);
    if v_payout.amount>v_available then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
    update public.financial_transactions set status='PENDING' where payout_id=p_payout_id and transaction_type='PAYOUT';
  end if;
  update public.payouts
     set status=p_target_status,
         reviewed_by=case when p_target_status in ('APPROVED','PROCESSING','PAID','FAILED','REJECTED') then p_actor_id else reviewed_by end,
         review_notes=coalesce(nullif(trim(p_notes),''),review_notes),
         provider_id=coalesce(nullif(trim(p_provider_id),''),provider_id),
         processed_at=case when p_target_status in ('PAID','FAILED','REJECTED','CANCELLED') then now() when p_target_status='PROCESSING' then null else processed_at end,
         updated_at=now()
   where id=p_payout_id returning * into v_payout;
  if not (v_payout.status='PROCESSING' and exists(select 1 from public.financial_transactions where payout_id=p_payout_id and transaction_type='PAYOUT' and status='PENDING')) then
    update public.financial_transactions
       set status=case when p_target_status='PAID' then 'POSTED' when p_target_status in ('REJECTED','CANCELLED','FAILED') then 'VOID' else 'PENDING' end
     where payout_id=p_payout_id and transaction_type='PAYOUT';
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(p_actor_id,'DRIVER_PAYOUT_STATUS_CHANGED','payout',p_payout_id,jsonb_build_object('status',p_target_status,'notes',p_notes));
  if v_payout.driver_id is not null then
    insert into public.notifications(user_id,notification_type,title,body,data)
    select d.user_id,'PAYOUT_STATUS','Atualização de repasse',
      case p_target_status when 'APPROVED' then 'Seu repasse foi aprovado.' when 'PROCESSING' then 'Seu repasse está sendo processado.' when 'PAID' then 'Seu repasse foi marcado como pago.' when 'FAILED' then 'Houve uma falha no processamento do repasse.' when 'REJECTED' then 'Seu repasse foi rejeitado.' when 'CANCELLED' then 'Seu repasse foi cancelado.' else 'O status do seu repasse foi atualizado.' end,
      jsonb_build_object('payoutId',p_payout_id,'status',p_target_status,'amount',v_payout.amount)
    from public.drivers d where d.id=v_payout.driver_id;
  end if;
  return v_payout;
end;
$$;

create or replace function private.post_delivered_order_financials_atomic(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
  v_commission_pct numeric:=0;
  v_merchandise numeric:=0;
  v_commission numeric:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,17));
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status<>'DELIVERED' or v_order.payment_status<>'PAID' then return false; end if;
  if exists(select 1 from public.financial_transactions ft where ft.order_id=p_order_id and ft.transaction_type='ORDER_SALE' and ft.status='POSTED') then return false; end if;
  select d.* into v_delivery from public.deliveries d where d.order_id=p_order_id;
  select coalesce(p.commission_percentage,0)
    into v_commission_pct
    from public.subscriptions s
    join public.plans p on p.id=s.plan_id
   where s.store_id=v_order.store_id
   limit 1;
  if not found then v_commission_pct:=0; end if;
  v_merchandise:=greatest(0,round((v_order.total-v_order.delivery_fee)::numeric,2));
  v_commission:=round(v_merchandise*v_commission_pct/100,2);
  perform public.post_order_financials_atomic(
    v_order.id,v_order.store_id,v_delivery.driver_id,v_merchandise,v_commission,
    v_order.delivery_fee,coalesce(v_delivery.driver_earning,0)
  );
  return true;
end;
$$;
revoke all on function private.post_delivered_order_financials_atomic(uuid) from public, anon, authenticated;
grant execute on function private.post_delivered_order_financials_atomic(uuid) to service_role;

create or replace function private.post_order_financials_on_delivery()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.status='DELIVERED' and new.payment_status='PAID'
     and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    perform private.post_delivered_order_financials_atomic(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_post_delivered_financials on public.orders;
create trigger orders_post_delivered_financials
after update of status,payment_status on public.orders
for each row execute function private.post_order_financials_on_delivery();

create or replace function private.reverse_order_financials_full_refund(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,18));
  if exists(select 1 from public.financial_transactions where order_id=p_order_id and transaction_type='REFUND' and status='POSTED') then return false; end if;
  if not exists(select 1 from public.financial_transactions where order_id=p_order_id and transaction_type='ORDER_SALE' and status='POSTED') then return false; end if;
  insert into public.financial_transactions(store_id,order_id,driver_id,transaction_type,direction,amount,status)
  select store_id,order_id,driver_id,'REFUND',case when direction='CREDIT' then 'DEBIT' else 'CREDIT' end,amount,'POSTED'
    from public.financial_transactions
   where order_id=p_order_id
     and status='POSTED'
     and transaction_type in ('ORDER_SALE','PLATFORM_COMMISSION','DELIVERY_FEE','DRIVER_EARNING');
  return true;
end;
$$;
revoke all on function private.reverse_order_financials_full_refund(uuid) from public, anon, authenticated;
grant execute on function private.reverse_order_financials_full_refund(uuid) to service_role;

create or replace function private.reverse_order_financials_on_refund()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.payment_status='REFUNDED' and old.payment_status is distinct from new.payment_status then
    perform private.reverse_order_financials_full_refund(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_reverse_financials_on_refund on public.orders;
create trigger orders_reverse_financials_on_refund
after update of payment_status on public.orders
for each row execute function private.reverse_order_financials_on_refund();
