create or replace function private.sync_expired_driver_documents()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  affected_count integer := 0;
begin
  with expired as (
    update public.driver_documents dd
       set status = 'EXPIRED'
     where dd.status = 'APPROVED'
       and dd.expires_at is not null
       and dd.expires_at < current_date
    returning dd.driver_id, dd.document_type
  )
  select count(*) into expired_count from expired;

  with affected as (
    select distinct d.id, d.user_id, dv.vehicle_type
      from public.drivers d
      join public.driver_vehicles dv on dv.driver_id=d.id and dv.active=true
     where d.status='ACTIVE'
       and exists (
         select 1
           from unnest(case when dv.vehicle_type='BICYCLE'
             then array['PROFILE_PHOTO','IDENTITY']::text[]
             else array['PROFILE_PHOTO','IDENTITY','CNH','VEHICLE_DOCUMENT']::text[] end) required(document_type)
          where not exists (
            select 1 from public.driver_documents dd
             where dd.driver_id=d.id
               and dd.document_type=required.document_type
               and dd.status='APPROVED'
               and (dd.expires_at is null or dd.expires_at>=current_date)
          )
       )
  ), changed as (
    update public.drivers d
       set status='PENDING', online=false
      from affected a
     where d.id=a.id
    returning d.id,d.user_id
  ), notices as (
    insert into public.notifications(user_id,notification_type,title,body,data)
    select c.user_id,'DRIVER_DOCUMENT_EXPIRED','Documento vencido','Um documento obrigatório venceu. Reenvie o documento para voltar a ficar online no CLICK-FOOD.',jsonb_build_object('driverId',c.id)
      from changed c
    returning 1
  )
  select count(*) into affected_count from changed;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
  select null,'DRIVER_DOCUMENT_EXPIRATION_SYNC','system',null,jsonb_build_object('expiredDocuments',expired_count,'driversReturnedToPending',affected_count)
  where expired_count>0 or affected_count>0;

  return jsonb_build_object('expiredDocuments',expired_count,'driversReturnedToPending',affected_count);
end;
$$;

revoke all on function private.sync_expired_driver_documents() from public, anon, authenticated;
grant execute on function private.sync_expired_driver_documents() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='clickfood_driver_document_expiration' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('clickfood_driver_document_expiration','20 8 * * *','select private.sync_expired_driver_documents();');
end $$;
