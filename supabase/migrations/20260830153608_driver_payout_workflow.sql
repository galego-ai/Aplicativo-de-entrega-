create or replace function private.request_driver_payout_atomic(p_driver_id uuid,p_user_id uuid,p_amount numeric,p_method text,p_destination_value text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_available numeric := 0;
  v_payout_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_method not in ('PIX','BANK_TRANSFER','OTHER') then raise exception 'INVALID_METHOD'; end if;
  if nullif(trim(p_destination_value),'') is null then raise exception 'DESTINATION_REQUIRED'; end if;
  if not exists(select 1 from public.drivers d where d.id=p_driver_id and d.user_id=p_user_id) then raise exception 'DRIVER_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_driver_id::text,1));
  select coalesce(sum(case when direction='CREDIT' then amount else -amount end),0)
    into v_available
    from public.financial_transactions
   where driver_id=p_driver_id and status in ('POSTED','PENDING');

  if p_amount > v_available then raise exception 'INSUFFICIENT_AVAILABLE_BALANCE'; end if;

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

create or replace function private.review_driver_payout_atomic(p_payout_id uuid,p_target_status text,p_actor_id uuid,p_notes text default null,p_provider_id text default null)
returns public.payouts
language plpgsql
security definer
set search_path=''
as $$
declare
  v_payout public.payouts;
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

  update public.payouts
     set status=p_target_status,
         reviewed_by=case when p_target_status in ('APPROVED','PROCESSING','PAID','FAILED','REJECTED') then p_actor_id else reviewed_by end,
         review_notes=coalesce(nullif(trim(p_notes),''),review_notes),
         provider_id=coalesce(nullif(trim(p_provider_id),''),provider_id),
         processed_at=case when p_target_status in ('PAID','FAILED','REJECTED','CANCELLED') then now() else processed_at end,
         updated_at=now()
   where id=p_payout_id returning * into v_payout;

  update public.financial_transactions
     set status=case when p_target_status='PAID' then 'POSTED' when p_target_status in ('REJECTED','CANCELLED','FAILED') then 'VOID' else 'PENDING' end
   where payout_id=p_payout_id and transaction_type='PAYOUT';

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(p_actor_id,'DRIVER_PAYOUT_STATUS_CHANGED','payout',p_payout_id,jsonb_build_object('status',p_target_status,'notes',p_notes));

  if v_payout.driver_id is not null then
    insert into public.notifications(user_id,notification_type,title,body,data)
    select d.user_id,'PAYOUT_STATUS','Atualização de repasse',
      case p_target_status when 'APPROVED' then 'Seu repasse foi aprovado.' when 'PROCESSING' then 'Seu repasse está sendo processado.' when 'PAID' then 'Seu repasse foi marcado como pago.' when 'FAILED' then 'Houve uma falha no processamento do repasse.' when 'REJECTED' then 'Seu repasse foi rejeitado.' else 'O status do seu repasse foi atualizado.' end,
      jsonb_build_object('payoutId',p_payout_id,'status',p_target_status,'amount',v_payout.amount)
    from public.drivers d where d.id=v_payout.driver_id;
  end if;

  return v_payout;
end;
$$;

revoke all on function private.request_driver_payout_atomic(uuid,uuid,numeric,text,text) from public,anon,authenticated;
revoke all on function private.review_driver_payout_atomic(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function private.request_driver_payout_atomic(uuid,uuid,numeric,text,text) to service_role;
grant execute on function private.review_driver_payout_atomic(uuid,text,uuid,text,text) to service_role;
