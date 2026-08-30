create or replace function public.anonymize_self_account_atomic(p_user_id uuid, p_apply boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid;
  v_business_count integer;
  v_active_orders integer;
  v_active_deliveries integer;
  v_active_payouts integer;
begin
  if p_user_id is null then raise exception 'USER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*) into v_business_count from public.store_memberships where user_id=p_user_id;
  if v_business_count>0 then raise exception 'BUSINESS_ACCOUNT_TRANSFER_REQUIRED'; end if;

  select count(*) into v_active_orders
  from public.orders
  where customer_id=p_user_id
    and status in ('PENDING_PAYMENT','WAITING_STORE','ACCEPTED','PREPARING','READY','WAITING_DRIVER','DRIVER_ASSIGNED','PICKED_UP','ON_THE_WAY');
  if v_active_orders>0 then raise exception 'ACTIVE_ORDER_EXISTS'; end if;

  select id into v_driver_id from public.drivers where user_id=p_user_id limit 1;
  if v_driver_id is not null then
    select count(*) into v_active_deliveries
    from public.deliveries
    where driver_id=v_driver_id and status not in ('DELIVERED','DELIVERY_CANCELLED');
    if v_active_deliveries>0 then raise exception 'ACTIVE_DELIVERY_EXISTS'; end if;

    select count(*) into v_active_payouts
    from public.payouts
    where driver_id=v_driver_id and status in ('REQUESTED','APPROVED','PROCESSING');
    if v_active_payouts>0 then raise exception 'ACTIVE_PAYOUT_EXISTS'; end if;
  end if;

  if not p_apply then
    return jsonb_build_object('ok',true,'driverId',v_driver_id,'canDelete',true);
  end if;

  update public.profiles
     set full_name='Conta excluída', phone=null, avatar_url=null, status='BLOCKED', updated_at=now()
   where id=p_user_id;

  update public.orders
     set customer_id=null, address_id=null, customer_notes=null, updated_at=now()
   where customer_id=p_user_id;

  update public.coupon_redemptions set customer_id=null where customer_id=p_user_id;
  update public.reviews set comment=null where customer_id=p_user_id;
  update public.messages set content=null, attachment_url=null where sender_id=p_user_id;
  update public.support_messages set body='Conteúdo removido por exclusão de conta', attachment_url=null where sender_id=p_user_id;
  update public.support_tickets set subject='Atendimento de conta excluída' where opened_by=p_user_id;
  update public.customer_loyalty_wallets set balance=0, debt_points=0, updated_at=now() where customer_id=p_user_id;

  delete from public.customer_addresses where user_id=p_user_id;
  delete from public.delivery_quotes where customer_id=p_user_id;
  delete from public.device_push_tokens where user_id=p_user_id;
  delete from public.notification_preferences where user_id=p_user_id;
  delete from public.notification_push_deliveries where user_id=p_user_id;
  delete from public.notifications where user_id=p_user_id;
  delete from public.conversation_participants where user_id=p_user_id;

  update public.audit_logs set actor_id=null where actor_id=p_user_id;
  update public.order_status_history set changed_by=null where changed_by=p_user_id;
  update public.refunds set created_by=null where created_by=p_user_id;
  update public.payouts set requested_by=null where requested_by=p_user_id;
  update public.payouts set reviewed_by=null where reviewed_by=p_user_id;
  update public.bonus_redemptions set requested_by=null where requested_by=p_user_id;
  update public.bonus_redemptions set reviewed_by=null where reviewed_by=p_user_id;
  update public.campaigns set created_by=null where created_by=p_user_id;
  update public.inventory_movements set created_by=null where created_by=p_user_id;
  update public.driver_documents set reviewed_by=null where reviewed_by=p_user_id;
  update public.store_onboarding_codes set created_by=null where created_by=p_user_id;
  update public.store_onboarding_codes set used_by=null where used_by=p_user_id;
  update public.admin_bootstrap_codes set used_by=null where used_by=p_user_id;
  update public.payout_provider_configs set updated_by=null where updated_by=p_user_id;

  if v_driver_id is not null then
    update public.drivers set online=false, status='BLOCKED' where id=v_driver_id;
    delete from public.driver_locations where driver_id=v_driver_id;
    delete from public.driver_vehicles where driver_id=v_driver_id;
    delete from public.driver_documents where driver_id=v_driver_id;
    update public.payouts
       set destination_value=null, provider_payload=null, provider_last_error=null, updated_at=now()
     where driver_id=v_driver_id;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  values(null,'SELF_ACCOUNT_ANONYMIZED','account',null,jsonb_build_object('deletedUserIdHash',encode(digest(p_user_id::text,'sha256'),'hex'),'hadDriver',v_driver_id is not null));

  return jsonb_build_object('ok',true,'driverId',v_driver_id,'anonymized',true);
end;
$$;

revoke all on function public.anonymize_self_account_atomic(uuid,boolean) from public, anon, authenticated;
grant execute on function public.anonymize_self_account_atomic(uuid,boolean) to service_role;
