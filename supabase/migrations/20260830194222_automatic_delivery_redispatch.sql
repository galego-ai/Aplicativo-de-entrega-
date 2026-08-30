create index if not exists idx_delivery_offers_pending_expiry
  on public.delivery_offers(expires_at,delivery_id)
  where status='PENDING';

create or replace function private.expire_delivery_offers_atomic()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer:=0;
begin
  update public.delivery_offers
     set status='EXPIRED', responded_at=coalesce(responded_at,now())
   where status='PENDING' and expires_at<=now();
  get diagnostics v_count=row_count;

  update public.deliveries d
     set status='SEARCHING_DRIVER',updated_at=now()
   where d.driver_id is null
     and d.status='OFFER_SENT'
     and not exists(
       select 1 from public.delivery_offers o
       where o.delivery_id=d.id and o.status='PENDING' and o.expires_at>now()
     )
     and exists(
       select 1 from public.orders ord
       where ord.id=d.order_id and ord.status in ('READY','WAITING_DRIVER')
     );
  return v_count;
end;
$$;
revoke all on function private.expire_delivery_offers_atomic() from public,anon,authenticated;
grant execute on function private.expire_delivery_offers_atomic() to service_role;

create or replace function private.dispatch_waiting_order_atomic(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.deliveries%rowtype;
  v_city_id uuid;
  v_store_lat double precision;
  v_store_lng double precision;
  v_customer_lat double precision;
  v_customer_lng double precision;
  v_timeout integer:=15;
  v_initial_radius double precision:=5;
  v_max_radius double precision:=20;
  v_batch_size integer:=3;
  v_base double precision:=4;
  v_per_km double precision:=1;
  v_minimum double precision:=6;
  v_delivery_distance double precision;
  v_expires_at timestamptz;
  v_inserted integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,42));

  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.delivery_type<>'DELIVERY' or v_order.status not in ('READY','WAITING_DRIVER') then return 0; end if;

  select s.city_id,s.latitude::double precision,s.longitude::double precision
    into v_city_id,v_store_lat,v_store_lng
    from public.stores s where s.id=v_order.store_id;
  if v_city_id is null or v_store_lat is null or v_store_lng is null or v_order.address_id is null then return 0; end if;

  select a.latitude::double precision,a.longitude::double precision
    into v_customer_lat,v_customer_lng
    from public.customer_addresses a where a.id=v_order.address_id;
  if v_customer_lat is null or v_customer_lng is null then return 0; end if;

  select coalesce(ds.offer_timeout_seconds,15),coalesce(ds.initial_radius_km,5)::double precision,
         coalesce(ds.max_radius_km,20)::double precision,coalesce(ds.batch_size,3)
    into v_timeout,v_initial_radius,v_max_radius,v_batch_size
    from public.delivery_dispatch_settings ds where ds.city_id=v_city_id;
  if not found then v_timeout:=15;v_initial_radius:=5;v_max_radius:=20;v_batch_size:=3; end if;

  select coalesce(cp.driver_base_earning,4)::double precision,coalesce(cp.driver_per_km,1)::double precision,
         coalesce(cp.driver_minimum_earning,6)::double precision
    into v_base,v_per_km,v_minimum
    from public.city_delivery_pricing cp where cp.city_id=v_city_id;
  if not found then v_base:=4;v_per_km:=1;v_minimum:=6; end if;

  select * into v_delivery from public.deliveries where order_id=v_order.id for update;
  if not found then
    insert into public.deliveries(order_id,status,delivery_fee,driver_earning)
    values(v_order.id,'SEARCHING_DRIVER',v_order.delivery_fee,0)
    returning * into v_delivery;
  end if;
  if v_delivery.driver_id is not null or v_delivery.status in ('DELIVERED','DELIVERY_CANCELLED') then return 0; end if;

  update public.delivery_offers
     set status='EXPIRED',responded_at=coalesce(responded_at,now())
   where delivery_id=v_delivery.id and status='PENDING' and expires_at<=now();

  if exists(select 1 from public.delivery_offers o where o.delivery_id=v_delivery.id and o.status='PENDING' and o.expires_at>now()) then
    return 0;
  end if;

  v_delivery_distance:=2*6371*asin(sqrt(
    power(sin(radians(v_customer_lat-v_store_lat)/2),2)+
    cos(radians(v_store_lat))*cos(radians(v_customer_lat))*power(sin(radians(v_customer_lng-v_store_lng)/2),2)
  ));
  v_expires_at:=now()+make_interval(secs=>greatest(5,v_timeout));

  with candidate_base as (
    select d.id as driver_id,d.user_id,
      2*6371*asin(sqrt(
        power(sin(radians(dl.latitude::double precision-v_store_lat)/2),2)+
        cos(radians(v_store_lat))*cos(radians(dl.latitude::double precision))*
        power(sin(radians(dl.longitude::double precision-v_store_lng)/2),2)
      )) as pickup_km,
      (select count(*)::integer from public.deliveries ad where ad.driver_id=d.id and ad.status not in ('DELIVERED','DELIVERY_CANCELLED')) as active_deliveries,
      d.rating::double precision as rating,
      d.acceptance_rate::double precision as acceptance_rate
    from public.drivers d
    join public.driver_locations dl on dl.driver_id=d.id
    where d.city_id=v_city_id and d.status='ACTIVE' and d.online=true
      and dl.recorded_at>now()-interval '5 minutes'
      and not exists(
        select 1 from public.delivery_offers old
        where old.delivery_id=v_delivery.id and old.driver_id=d.id
          and old.offered_at>now()-interval '5 minutes'
      )
  ), eligible as (
    select *,
      greatest(0,100-pickup_km*12)*0.55+
      greatest(0,100-active_deliveries*35)*0.20+
      rating*20*0.15+acceptance_rate*0.10 as score
    from candidate_base where pickup_km<=v_max_radius
  ), ranked as (
    select * from eligible
    order by case when pickup_km<=v_initial_radius then 0 else 1 end,score desc,pickup_km asc
    limit greatest(1,v_batch_size)
  )
  insert into public.delivery_offers(delivery_id,driver_id,status,offered_at,expires_at,offered_earning)
  select v_delivery.id,r.driver_id,'PENDING',now(),v_expires_at,
         round(greatest(v_minimum,v_base+(r.pickup_km+v_delivery_distance)*v_per_km)::numeric,2)
    from ranked r;
  get diagnostics v_inserted=row_count;

  if v_inserted>0 then
    update public.deliveries set status='OFFER_SENT',updated_at=now() where id=v_delivery.id and driver_id is null;
    update public.orders set status='WAITING_DRIVER',updated_at=now() where id=v_order.id and status='READY';
    insert into public.notifications(user_id,notification_type,title,body,data)
    select d.user_id,'DELIVERY_OFFER','Nova entrega disponível',
           'Novo chamado de entrega. Abra o app para ver o valor e aceitar.',
           jsonb_build_object('offerId',o.id,'deliveryId',v_delivery.id,'expiresAt',o.expires_at,'earning',o.offered_earning)
      from public.delivery_offers o join public.drivers d on d.id=o.driver_id
     where o.delivery_id=v_delivery.id and o.status='PENDING' and o.expires_at=v_expires_at;
  else
    update public.deliveries set status='SEARCHING_DRIVER',updated_at=now() where id=v_delivery.id and driver_id is null;
  end if;
  return v_inserted;
end;
$$;
revoke all on function private.dispatch_waiting_order_atomic(uuid) from public,anon,authenticated;
grant execute on function private.dispatch_waiting_order_atomic(uuid) to service_role;

create or replace function private.auto_dispatch_waiting_deliveries(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_order_id uuid;v_count integer:=0;v_sent integer:=0;
begin
  perform private.expire_delivery_offers_atomic();
  for v_order_id in
    select o.id
      from public.orders o
      left join public.deliveries d on d.order_id=o.id
     where o.delivery_type='DELIVERY' and o.status in ('READY','WAITING_DRIVER')
       and (d.id is null or (d.driver_id is null and d.status not in ('DELIVERED','DELIVERY_CANCELLED')))
       and not exists(
         select 1 from public.delivery_offers live
         where live.delivery_id=d.id and live.status='PENDING' and live.expires_at>now()
       )
     order by coalesce(o.ready_at,o.created_at),o.created_at
     limit greatest(1,least(coalesce(p_limit,20),100))
  loop
    v_sent:=private.dispatch_waiting_order_atomic(v_order_id);
    if v_sent>0 then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.auto_dispatch_waiting_deliveries(integer) from public,anon,authenticated;
grant execute on function private.auto_dispatch_waiting_deliveries(integer) to service_role;

select cron.unschedule(jobid) from cron.job where jobname='clickfood-auto-delivery-dispatch';
select cron.schedule('clickfood-auto-delivery-dispatch','* * * * *',$job$select private.auto_dispatch_waiting_deliveries(20);$job$);