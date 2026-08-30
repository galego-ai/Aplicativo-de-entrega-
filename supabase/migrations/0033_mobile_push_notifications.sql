create extension if not exists pg_net with schema extensions;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null check (app in ('CUSTOMER','DRIVER','STORE','ADMIN')),
  platform text not null check (platform in ('ANDROID','IOS','WEB','UNKNOWN')),
  provider text not null default 'EXPO' check (provider in ('EXPO')),
  token text not null unique,
  device_id text,
  app_identifier text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_push_tokens_user_enabled on public.device_push_tokens(user_id, enabled);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default true,
  marketing_enabled boolean not null default true,
  order_updates_enabled boolean not null default true,
  delivery_updates_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.device_push_tokens(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','REQUESTED','SENT','FAILED','SKIPPED')),
  attempts integer not null default 0 check (attempts >= 0),
  request_id bigint,
  batch_position integer,
  expo_ticket_id text,
  last_error text,
  available_at timestamptz not null default now(),
  requested_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, token_id)
);

create index if not exists idx_notification_push_pending on public.notification_push_deliveries(status, available_at, created_at) where status='PENDING';
create index if not exists idx_notification_push_request on public.notification_push_deliveries(request_id) where request_id is not null;
create index if not exists idx_notification_push_user on public.notification_push_deliveries(user_id, created_at desc);

alter table public.device_push_tokens enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_push_deliveries enable row level security;

drop policy if exists device_push_tokens_own_read on public.device_push_tokens;
create policy device_push_tokens_own_read on public.device_push_tokens for select to authenticated using (user_id=(select auth.uid()) or private.is_admin());

drop policy if exists notification_preferences_own_read on public.notification_preferences;
create policy notification_preferences_own_read on public.notification_preferences for select to authenticated using (user_id=(select auth.uid()) or private.is_admin());
drop policy if exists notification_preferences_own_insert on public.notification_preferences;
create policy notification_preferences_own_insert on public.notification_preferences for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists notification_preferences_own_update on public.notification_preferences;
create policy notification_preferences_own_update on public.notification_preferences for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists notification_push_deliveries_admin_read on public.notification_push_deliveries;
create policy notification_push_deliveries_admin_read on public.notification_push_deliveries for select to authenticated using (private.is_admin());

grant select on public.device_push_tokens to authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
grant select on public.notification_push_deliveries to authenticated;

create or replace function private.notification_push_allowed(p_user_id uuid, p_type text, p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select case
    when coalesce(p.push_enabled,true)=false then false
    when (coalesce(p_data->>'category','')='MARKETING' or p_type in ('MARKETING','PROMOTION','CAMPAIGN')) then coalesce(p.marketing_enabled,true)
    when p_type like 'ORDER_%' then coalesce(p.order_updates_enabled,true)
    when p_type like 'DELIVERY_%' or p_type like 'DRIVER_%' then coalesce(p.delivery_updates_enabled,true)
    else true
  end
  from (select 1) x
  left join public.notification_preferences p on p.user_id=p_user_id;
$$;
revoke all on function private.notification_push_allowed(uuid,text,jsonb) from public, anon, authenticated;

create or replace function private.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if private.notification_push_allowed(new.user_id,new.notification_type,new.data) then
    insert into public.notification_push_deliveries(notification_id,user_id,token_id)
    select new.id,new.user_id,t.id
    from public.device_push_tokens t
    where t.user_id=new.user_id and t.enabled=true
    on conflict(notification_id,token_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_notification_push() from public, anon, authenticated;

drop trigger if exists notifications_enqueue_push on public.notifications;
create trigger notifications_enqueue_push after insert on public.notifications for each row execute function private.enqueue_notification_push();

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
             'sound','default',
             'channelId','clickfood-default',
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

  v_request_id:=net.http_post(
    url:='https://exp.host/--/api/v2/push/send',
    body:=v_payload,
    headers:=jsonb_build_object('Content-Type','application/json','Accept','application/json','Accept-Encoding','gzip, deflate'),
    timeout_milliseconds:=5000
  );

  update public.notification_push_deliveries d
  set status='REQUESTED',
      request_id=v_request_id,
      batch_position=array_position(v_ids,d.id)-1,
      attempts=d.attempts+1,
      requested_at=now(),
      updated_at=now()
  where d.id=any(v_ids);

  return v_count;
end;
$$;
revoke all on function private.dispatch_notification_push_batch(integer) from public, anon, authenticated;

create or replace function private.reconcile_notification_push()
returns integer
language plpgsql
security definer
set search_path=public,private,net
as $$
declare
  r record;
  v_ticket jsonb;
  v_error text;
  v_done integer:=0;
begin
  for r in
    select d.id,d.token_id,d.attempts,d.batch_position,h.status_code,h.content,h.timed_out,h.error_msg
    from public.notification_push_deliveries d
    join net._http_response h on h.id=d.request_id
    where d.status='REQUESTED'
    order by d.requested_at
    limit 2000
  loop
    v_done:=v_done+1;
    if coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code is null or r.status_code<200 or r.status_code>=300 then
      if r.attempts<5 then
        update public.notification_push_deliveries set status='PENDING',request_id=null,batch_position=null,last_error=coalesce(r.error_msg,'HTTP_'||coalesce(r.status_code::text,'UNKNOWN')),available_at=now()+make_interval(mins=>least(30,greatest(1,r.attempts*2))),updated_at=now() where id=r.id;
      else
        update public.notification_push_deliveries set status='FAILED',last_error=coalesce(r.error_msg,'HTTP_'||coalesce(r.status_code::text,'UNKNOWN')),updated_at=now() where id=r.id;
      end if;
      continue;
    end if;

    begin
      v_ticket:=(r.content::jsonb->'data'->r.batch_position);
    exception when others then
      v_ticket:=null;
    end;

    if v_ticket is not null and v_ticket->>'status'='ok' then
      update public.notification_push_deliveries set status='SENT',expo_ticket_id=v_ticket->>'id',sent_at=now(),last_error=null,updated_at=now() where id=r.id;
    else
      v_error:=coalesce(v_ticket#>>'{details,error}',v_ticket->>'message','EXPO_RESPONSE_INVALID');
      if v_error='DeviceNotRegistered' then
        update public.device_push_tokens set enabled=false,updated_at=now() where id=r.token_id;
        update public.notification_push_deliveries set status='FAILED',last_error=v_error,updated_at=now() where id=r.id;
      elsif r.attempts<5 then
        update public.notification_push_deliveries set status='PENDING',request_id=null,batch_position=null,last_error=v_error,available_at=now()+make_interval(mins=>least(30,greatest(1,r.attempts*2))),updated_at=now() where id=r.id;
      else
        update public.notification_push_deliveries set status='FAILED',last_error=v_error,updated_at=now() where id=r.id;
      end if;
    end if;
  end loop;
  return v_done;
end;
$$;
revoke all on function private.reconcile_notification_push() from public, anon, authenticated;

create or replace function private.kick_notification_push()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  perform private.dispatch_notification_push_batch(100);
  return null;
end;
$$;
revoke all on function private.kick_notification_push() from public, anon, authenticated;

drop trigger if exists notifications_kick_push on public.notifications;
create trigger notifications_kick_push after insert on public.notifications for each statement execute function private.kick_notification_push();

do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='clickfood_push_dispatch' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
  select jobid into j from cron.job where jobname='clickfood_push_reconcile' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
end $$;

select cron.schedule('clickfood_push_dispatch','* * * * *',$job$select private.dispatch_notification_push_batch(100);$job$);
select cron.schedule('clickfood_push_reconcile','* * * * *',$job$select private.reconcile_notification_push();$job$);