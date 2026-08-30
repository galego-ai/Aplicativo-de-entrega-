create or replace function private.prepare_efi_payout_send_atomic(
  p_payout_id uuid,
  p_actor_id uuid default null
)
returns table(payout_id uuid,id_envio text,reused boolean)
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.payouts%rowtype;
  v_id text;
  v_existing text;
begin
  perform pg_advisory_xact_lock(hashtextextended('CLICKFOOD_EFI_PIX_PAYOUT_SERIAL',0));
  select * into v from public.payouts where id=p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;
  if v.method<>'PIX' or nullif(trim(v.destination_value),'') is null then raise exception 'PAYOUT_PIX_DESTINATION_REQUIRED'; end if;
  if v.status='PAID' then return query select v.id,coalesce(v.provider_id,''),true; return; end if;
  if v.status not in ('APPROVED','FAILED','PROCESSING') then raise exception 'PAYOUT_NOT_SENDABLE'; end if;

  select a.id_envio into v_existing
    from public.payout_provider_attempts a
   where a.payout_id=v.id and a.status in ('CREATED','EM_PROCESSAMENTO','UNKNOWN')
   order by a.created_at desc limit 1;
  if v_existing is not null then
    update public.payouts set provider_name='EFI',provider_id=v_existing,updated_at=now() where id=v.id;
    return query select v.id,v_existing,true; return;
  end if;

  if exists(
    select 1 from public.payouts p
    where p.id<>v.id and p.status='PROCESSING' and p.provider_name='EFI'
  ) then raise exception 'ANOTHER_EFI_PAYOUT_PROCESSING'; end if;

  if v.status<>'PROCESSING' then
    if v.recipient_type='STORE' then
      perform private.review_store_payout_atomic(v.id,'PROCESSING',p_actor_id,case when v.status='FAILED' then 'Nova tentativa de envio Pix pela Efí' else 'Envio Pix iniciado pela Efí' end,null);
    else
      perform private.review_driver_payout_atomic(v.id,'PROCESSING',p_actor_id,case when v.status='FAILED' then 'Nova tentativa de envio Pix pela Efí' else 'Envio Pix iniciado pela Efí' end,null);
    end if;
  end if;

  v_id:=replace(gen_random_uuid()::text,'-','');
  insert into public.payout_provider_attempts(payout_id,provider,id_envio,status)
  values(v.id,'EFI',v_id,'CREATED');
  update public.payouts set provider_name='EFI',provider_id=v_id,provider_status='CREATED',provider_checked_at=now(),updated_at=now() where id=v.id;
  return query select v.id,v_id,false;
end;$$;
revoke all on function private.prepare_efi_payout_send_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function private.prepare_efi_payout_send_atomic(uuid,uuid) to service_role;

create or replace function private.next_automatic_efi_payout()
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('CLICKFOOD_EFI_PIX_PAYOUT_SERIAL',0));
  if not exists(select 1 from public.payout_provider_configs where provider='EFI_PIX_SEND' and enabled=true and credentials_configured=true and automatic_processing=true) then return null; end if;
  select id into v_id from public.payouts where status='PROCESSING' and provider_name='EFI' order by requested_at limit 1;
  if v_id is not null then return v_id; end if;
  select id into v_id from public.payouts where status='APPROVED' and method='PIX' and nullif(trim(destination_value),'') is not null order by requested_at for update skip locked limit 1;
  return v_id;
end;$$;
revoke all on function private.next_automatic_efi_payout() from public,anon,authenticated;
grant execute on function private.next_automatic_efi_payout() to service_role;