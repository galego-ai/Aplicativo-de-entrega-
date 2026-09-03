create or replace function private.notification_push_allowed(p_user_id uuid, p_type text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select case
    when coalesce(p.push_enabled,true)=false then false
    when p_type in (
      'DELIVERY_OFFER',
      'ORDER_WAITING_STORE','ORDER_WAITING_DRIVER','ORDER_DRIVER_TO_STORE','ORDER_PICKUP_CONFIRMED',
      'DRIVER_DRIVER_TO_STORE','DRIVER_DRIVER_AT_STORE','DRIVER_PICKUP_CONFIRMED',
      'DRIVER_DRIVER_TO_CUSTOMER','DRIVER_DRIVER_AT_CUSTOMER','DRIVER_DELIVERED'
    ) then false
    when (coalesce(p_data->>'category','')='MARKETING' or p_type in ('MARKETING','PROMOTION','CAMPAIGN')) then coalesce(p.marketing_enabled,true)
    when p_type like 'ORDER_%' then coalesce(p.order_updates_enabled,true)
    when p_type like 'DELIVERY_%' or p_type like 'DRIVER_%' then coalesce(p.delivery_updates_enabled,true)
    else true
  end
  from (select 1) x
  left join public.notification_preferences p on p.user_id=p_user_id;
$$;
revoke all on function private.notification_push_allowed(uuid,text,jsonb) from public, anon, authenticated;

create or replace function private.dispatch_notification_push_batch(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path=public,private,net,extensions
as $$
declare
  v_ids uuid[];
  v_payload jsonb;
  v_request_id bigint;
  v_count integer;
begin
  update public.notification_push_deliveries d
  set status='SKIPPED',last_error='TOKEN_DISABLED',updated_at=now()
  from public.device_push_tokens t
  where d.token_id=t.id and d.status='PENDING' and t.enabled=false;

  with candidates as materialized (
    select d.id
    from public.notification_push_deliveries d
    join public.device_push_tokens t on t.id=d.token_id and t.enabled=true
    where d.status='PENDING' and d.available_at<=now()
    order by d.created_at
    limit least(greatest(coalesce(p_limit,100),1),100)
    for update of d skip locked
  ), picked as (
    select d.id,
           row_number() over(order by d.created_at,d.id)-1 as pos,
           jsonb_build_object(
             'to',t.token,
             'title',n.title,
             'body',n.body,
             'sound',case when n.notification_type='DRIVER_OFFER' then 'clickfood_chamada.wav' else 'default' end,
             'channelId',case when n.notification_type='DRIVER_OFFER' then 'clickfood-chamadas' else 'clickfood-default' end,
             'priority',case when n.notification_type='DRIVER_OFFER' or n.notification_type in ('ORDER_DRIVER_AT_CUSTOMER','DRIVER_DRIVER_ASSIGNED','DRIVER_DELIVERY_CANCELLED','DRIVER_RETURN_REQUIRED','DRIVER_INCIDENT') then 'high' else 'default' end,
             'ttl',case when n.notification_type='DRIVER_OFFER' then 25 else 86400 end,
             'data',coalesce(n.data,'{}'::jsonb)||jsonb_build_object('notificationId',n.id,'notificationType',n.notification_type)
           ) as message
    from candidates c
    join public.notification_push_deliveries d on d.id=c.id
    join public.notifications n on n.id=d.notification_id
    join public.device_push_tokens t on t.id=d.token_id
  )
  select array_agg(id order by pos),jsonb_agg(message order by pos),count(*)::int
  into v_ids,v_payload,v_count
  from picked;

  if coalesce(v_count,0)=0 then return 0; end if;
  v_request_id:=net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=v_payload,headers:=jsonb_build_object('Content-Type','application/json','Accept','application/json','Accept-Encoding','gzip, deflate'),timeout_milliseconds:=5000);
  update public.notification_push_deliveries d set status='REQUESTED',request_id=v_request_id,batch_position=array_position(v_ids,d.id)-1,attempts=d.attempts+1,requested_at=now(),updated_at=now() where d.id=any(v_ids);
  return v_count;
end;
$$;
revoke all on function private.dispatch_notification_push_batch(integer) from public,anon,authenticated;
