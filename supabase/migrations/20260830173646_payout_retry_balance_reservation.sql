create or replace function private.review_store_payout_atomic(
  p_payout_id uuid,
  p_target_status text,
  p_actor_id uuid,
  p_notes text default null,
  p_provider_id text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.payouts;
  v_available numeric := 0;
begin
  select * into v_payout from public.payouts where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_payout.recipient_type <> 'STORE' then raise exception 'INVALID_RECIPIENT'; end if;

  if not (
    (v_payout.status='REQUESTED' and p_target_status in ('APPROVED','REJECTED','CANCELLED')) or
    (v_payout.status='APPROVED' and p_target_status in ('PROCESSING','PAID','REJECTED')) or
    (v_payout.status='PROCESSING' and p_target_status in ('PAID','FAILED')) or
    (v_payout.status='FAILED' and p_target_status in ('PROCESSING','CANCELLED'))
  ) then raise exception 'INVALID_PAYOUT_TRANSITION'; end if;

  if v_payout.status='FAILED' and p_target_status='PROCESSING' then
    perform pg_advisory_xact_lock(hashtextextended(v_payout.store_id::text,0));
    select coalesce(sum(case when direction='CREDIT' then amount else -amount end),0)
      into v_available
      from public.financial_transactions
     where store_id=v_payout.store_id and status in ('POSTED','PENDING');
    if v_payout.amount > v_available then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
    update public.financial_transactions set status='PENDING'
     where payout_id=p_payout_id and transaction_type='PAYOUT';
  end if;

  update public.payouts
     set status=p_target_status,
         reviewed_by=case when p_target_status in ('APPROVED','PROCESSING','PAID','FAILED','REJECTED') then p_actor_id else reviewed_by end,
         review_notes=coalesce(nullif(trim(p_notes),''),review_notes),
         provider_id=coalesce(nullif(trim(p_provider_id),''),provider_id),
         processed_at=case when p_target_status in ('PAID','FAILED','REJECTED','CANCELLED') then now() when p_target_status='PROCESSING' then null else processed_at end,
         updated_at=now()
   where id=p_payout_id returning * into v_payout;

  if not (v_payout.status='PROCESSING' and exists(
    select 1 from public.financial_transactions where payout_id=p_payout_id and transaction_type='PAYOUT' and status='PENDING'
  )) then
    update public.financial_transactions
       set status=case when p_target_status='PAID' then 'POSTED' when p_target_status in ('REJECTED','CANCELLED','FAILED') then 'VOID' else 'PENDING' end
     where payout_id=p_payout_id and transaction_type='PAYOUT';
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(p_actor_id,'STORE_PAYOUT_STATUS_CHANGED','payout',p_payout_id,jsonb_build_object('status',p_target_status,'notes',p_notes));

  insert into public.notifications(user_id,notification_type,title,body,data)
  select distinct sm.user_id,'PAYOUT_STATUS','Atualização de repasse',
    case p_target_status
      when 'APPROVED' then 'O repasse da loja foi aprovado.'
      when 'PROCESSING' then 'O repasse da loja está sendo processado.'
      when 'PAID' then 'O repasse da loja foi marcado como pago.'
      when 'FAILED' then 'Houve uma falha no processamento do repasse da loja.'
      when 'REJECTED' then 'O repasse da loja foi rejeitado.'
      when 'CANCELLED' then 'O repasse da loja foi cancelado.'
      else 'O status do repasse da loja foi atualizado.' end,
    jsonb_build_object('payoutId',p_payout_id,'status',p_target_status,'amount',v_payout.amount,'storeId',v_payout.store_id)
  from public.store_memberships sm
  where sm.store_id=v_payout.store_id and sm.active=true and sm.role in ('OWNER','MANAGER');

  return v_payout;
end;
$$;

create or replace function private.review_driver_payout_atomic(
  p_payout_id uuid,
  p_target_status text,
  p_actor_id uuid,
  p_notes text default null,
  p_provider_id text default null
)
returns public.payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout public.payouts;
  v_available numeric := 0;
begin
  select * into v_payout from public.payouts where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v_payout.recipient_type <> 'DRIVER' then raise exception 'INVALID_RECIPIENT'; end if;
  if not (
    (v_payout.status='REQUESTED' and p_target_status in ('APPROVED','REJECTED','CANCELLED')) or
    (v_payout.status='APPROVED' and p_target_status in ('PROCESSING','PAID','REJECTED')) or
    (v_payout.status='PROCESSING' and p_target_status in ('PAID','FAILED')) or
    (v_payout.status='FAILED' and p_target_status in ('PROCESSING','CANCELLED'))
  ) then raise exception 'INVALID_PAYOUT_TRANSITION'; end if;

  if v_payout.status='FAILED' and p_target_status='PROCESSING' then
    perform pg_advisory_xact_lock(hashtextextended(v_payout.driver_id::text,1));
    select coalesce(sum(case when direction='CREDIT' then amount else -amount end),0)
      into v_available
      from public.financial_transactions
     where driver_id=v_payout.driver_id and status in ('POSTED','PENDING');
    if v_payout.amount > v_available then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;
    update public.financial_transactions set status='PENDING'
     where payout_id=p_payout_id and transaction_type='PAYOUT';
  end if;

  update public.payouts
     set status=p_target_status,
         reviewed_by=case when p_target_status in ('APPROVED','PROCESSING','PAID','FAILED','REJECTED') then p_actor_id else reviewed_by end,
         review_notes=coalesce(nullif(trim(p_notes),''),review_notes),
         provider_id=coalesce(nullif(trim(p_provider_id),''),provider_id),
         processed_at=case when p_target_status in ('PAID','FAILED','REJECTED','CANCELLED') then now() when p_target_status='PROCESSING' then null else processed_at end,
         updated_at=now()
   where id=p_payout_id returning * into v_payout;

  if not (v_payout.status='PROCESSING' and exists(
    select 1 from public.financial_transactions where payout_id=p_payout_id and transaction_type='PAYOUT' and status='PENDING'
  )) then
    update public.financial_transactions
       set status=case when p_target_status='PAID' then 'POSTED' when p_target_status in ('REJECTED','CANCELLED','FAILED') then 'VOID' else 'PENDING' end
     where payout_id=p_payout_id and transaction_type='PAYOUT';
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(p_actor_id,'DRIVER_PAYOUT_STATUS_CHANGED','payout',p_payout_id,jsonb_build_object('status',p_target_status,'notes',p_notes));

  if v_payout.driver_id is not null then
    insert into public.notifications(user_id,notification_type,title,body,data)
    select d.user_id,'PAYOUT_STATUS','Atualização de repasse',
      case p_target_status
        when 'APPROVED' then 'Seu repasse foi aprovado.'
        when 'PROCESSING' then 'Seu repasse está sendo processado.'
        when 'PAID' then 'Seu repasse foi marcado como pago.'
        when 'FAILED' then 'Houve uma falha no processamento do repasse.'
        when 'REJECTED' then 'Seu repasse foi rejeitado.'
        when 'CANCELLED' then 'Seu repasse foi cancelado.'
        else 'O status do seu repasse foi atualizado.' end,
      jsonb_build_object('payoutId',p_payout_id,'status',p_target_status,'amount',v_payout.amount)
    from public.drivers d where d.id=v_payout.driver_id;
  end if;

  return v_payout;
end;
$$;