create or replace function private.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_title text;
  v_body text;
  v_status text:=new.status;
begin
  if new.customer_id is null then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status then return new; end if;

  v_title:=case v_status
    when 'PENDING_PAYMENT' then 'Aguardando pagamento'
    when 'WAITING_STORE' then 'Pedido enviado'
    when 'ACCEPTED' then 'Pedido aceito'
    when 'PREPARING' then 'Pedido em preparação'
    when 'READY' then case when new.delivery_type='PICKUP' then 'Pedido pronto para retirada' else 'Pedido pronto' end
    when 'WAITING_DRIVER' then 'Procurando entregador'
    when 'DRIVER_ASSIGNED' then 'Entregador confirmado'
    when 'DRIVER_TO_STORE' then 'Entregador indo buscar seu pedido'
    when 'PICKUP_CONFIRMED' then 'Pedido retirado'
    when 'PICKED_UP' then 'Pedido retirado'
    when 'DRIVER_TO_CUSTOMER' then 'Seu pedido está a caminho'
    when 'ON_THE_WAY' then 'Seu pedido está a caminho'
    when 'DRIVER_AT_CUSTOMER' then 'Seu entregador chegou'
    when 'DELIVERED' then 'Pedido entregue'
    when 'CANCELLED' then 'Pedido cancelado'
    when 'REJECTED' then 'Pedido recusado'
    when 'PAYMENT_FAILED' then 'Pagamento não aprovado'
    else null
  end;
  if v_title is null then return new; end if;

  v_body:=case v_status
    when 'PENDING_PAYMENT' then format('Finalize o pagamento do pedido #%s para continuar.',new.order_number)
    when 'WAITING_STORE' then format('A loja recebeu o pedido #%s e vai confirmar em instantes.',new.order_number)
    when 'ACCEPTED' then format('O pedido #%s foi aceito pela loja.',new.order_number)
    when 'PREPARING' then format('A loja começou a preparar o pedido #%s.',new.order_number)
    when 'READY' then case when new.delivery_type='PICKUP' then format('O pedido #%s já pode ser retirado na loja.',new.order_number) else format('O pedido #%s está pronto e vamos localizar um entregador.',new.order_number) end
    when 'WAITING_DRIVER' then format('Estamos procurando um entregador para o pedido #%s.',new.order_number)
    when 'DRIVER_ASSIGNED' then format('Um entregador aceitou o pedido #%s.',new.order_number)
    when 'DRIVER_TO_STORE' then format('O entregador está indo à loja buscar o pedido #%s.',new.order_number)
    when 'PICKUP_CONFIRMED' then format('O entregador retirou o pedido #%s na loja.',new.order_number)
    when 'PICKED_UP' then format('O entregador retirou o pedido #%s na loja.',new.order_number)
    when 'DRIVER_TO_CUSTOMER' then format('Acompanhe no mapa: o pedido #%s está a caminho.',new.order_number)
    when 'ON_THE_WAY' then format('Acompanhe no mapa: o pedido #%s está a caminho.',new.order_number)
    when 'DRIVER_AT_CUSTOMER' then format('O entregador do pedido #%s chegou ao endereço de entrega.',new.order_number)
    when 'DELIVERED' then format('O pedido #%s foi entregue. Você já pode avaliar a experiência.',new.order_number)
    when 'CANCELLED' then format('O pedido #%s foi cancelado.',new.order_number)
    when 'REJECTED' then format('A loja não conseguiu aceitar o pedido #%s.',new.order_number)
    when 'PAYMENT_FAILED' then format('Não foi possível confirmar o pagamento do pedido #%s.',new.order_number)
    else format('O pedido #%s foi atualizado.',new.order_number)
  end;

  insert into public.notifications(user_id,notification_type,title,body,data)
  values(new.customer_id,'ORDER_'||v_status,v_title,v_body,jsonb_build_object('category','OPERATIONAL','screen','orders','orderId',new.id,'orderNumber',new.order_number,'status',v_status));
  return new;
end;
$$;
revoke all on function private.notify_order_status_change() from public,anon,authenticated;

drop trigger if exists orders_notify_customer_status on public.orders;
create trigger orders_notify_customer_status after insert or update of status on public.orders for each row execute function private.notify_order_status_change();

create or replace function private.notify_delivery_driver_status_change()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid;
  v_order_number bigint;
  v_title text;
  v_body text;
begin
  if new.driver_id is null then return new; end if;
  if tg_op='UPDATE' and old.status is not distinct from new.status and old.driver_id is not distinct from new.driver_id then return new; end if;
  select d.user_id into v_user_id from public.drivers d where d.id=new.driver_id;
  if v_user_id is null then return new; end if;
  select o.order_number into v_order_number from public.orders o where o.id=new.order_id;

  v_title:=case new.status
    when 'DRIVER_ASSIGNED' then 'Entrega confirmada'
    when 'DRIVER_TO_STORE' then 'A caminho da loja'
    when 'DRIVER_AT_STORE' then 'Chegada à loja confirmada'
    when 'PICKUP_CONFIRMED' then 'Retirada confirmada'
    when 'DRIVER_TO_CUSTOMER' then 'Entrega iniciada'
    when 'DRIVER_AT_CUSTOMER' then 'Chegada ao cliente confirmada'
    when 'DELIVERED' then 'Entrega concluída'
    when 'DELIVERY_CANCELLED' then 'Entrega cancelada'
    when 'RETURN_REQUIRED' then 'Retorno solicitado'
    when 'INCIDENT' then 'Ocorrência na entrega'
    else null
  end;
  if v_title is null then return new; end if;

  v_body:=case new.status
    when 'DRIVER_ASSIGNED' then format('A entrega do pedido #%s está com você.',coalesce(v_order_number,0))
    when 'DRIVER_TO_STORE' then format('Siga para a loja para retirar o pedido #%s.',coalesce(v_order_number,0))
    when 'DRIVER_AT_STORE' then format('A chegada para retirar o pedido #%s foi registrada.',coalesce(v_order_number,0))
    when 'PICKUP_CONFIRMED' then format('Retirada do pedido #%s confirmada. Inicie a rota ao cliente.',coalesce(v_order_number,0))
    when 'DRIVER_TO_CUSTOMER' then format('Entrega do pedido #%s em andamento.',coalesce(v_order_number,0))
    when 'DRIVER_AT_CUSTOMER' then format('Sua chegada ao cliente do pedido #%s foi registrada.',coalesce(v_order_number,0))
    when 'DELIVERED' then format('Pedido #%s entregue. O ganho foi registrado na sua carteira.',coalesce(v_order_number,0))
    when 'DELIVERY_CANCELLED' then format('A entrega do pedido #%s foi cancelada.',coalesce(v_order_number,0))
    when 'RETURN_REQUIRED' then format('O pedido #%s precisa retornar à origem. Consulte as instruções no app.',coalesce(v_order_number,0))
    when 'INCIDENT' then format('Há uma ocorrência registrada na entrega do pedido #%s.',coalesce(v_order_number,0))
    else 'Sua entrega foi atualizada.'
  end;

  insert into public.notifications(user_id,notification_type,title,body,data)
  values(v_user_id,'DRIVER_'||new.status,v_title,v_body,jsonb_build_object('category','OPERATIONAL','screen','home','deliveryId',new.id,'orderId',new.order_id,'orderNumber',v_order_number,'status',new.status));
  return new;
end;
$$;
revoke all on function private.notify_delivery_driver_status_change() from public,anon,authenticated;

drop trigger if exists deliveries_notify_driver_status on public.deliveries;
create trigger deliveries_notify_driver_status after insert or update of status,driver_id on public.deliveries for each row execute function private.notify_delivery_driver_status_change();

create or replace function private.notify_driver_new_offer()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_store_name text;
  v_earning text;
begin
  if new.status<>'PENDING' then return new; end if;
  select d.user_id into v_user_id from public.drivers d where d.id=new.driver_id;
  if v_user_id is null then return new; end if;
  select dl.order_id,o.order_number,s.name into v_order_id,v_order_number,v_store_name
  from public.deliveries dl join public.orders o on o.id=dl.order_id join public.stores s on s.id=o.store_id
  where dl.id=new.delivery_id;
  v_earning:=replace(to_char(new.offered_earning,'FM999999990.00'),'.',',');
  insert into public.notifications(user_id,notification_type,title,body,data)
  values(v_user_id,'DRIVER_OFFER','Nova entrega disponível',format('%s • pedido #%s • ganho estimado R$ %s',coalesce(v_store_name,'Loja CLICK-FOOD'),coalesce(v_order_number,0),v_earning),jsonb_build_object('category','OPERATIONAL','screen','home','offerId',new.id,'deliveryId',new.delivery_id,'orderId',v_order_id,'orderNumber',v_order_number,'earning',new.offered_earning,'expiresAt',new.expires_at));
  return new;
end;
$$;
revoke all on function private.notify_driver_new_offer() from public,anon,authenticated;

drop trigger if exists delivery_offers_notify_driver on public.delivery_offers;
create trigger delivery_offers_notify_driver after insert on public.delivery_offers for each row execute function private.notify_driver_new_offer();

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
             'priority',case when n.notification_type='DRIVER_OFFER' or n.notification_type in ('ORDER_DRIVER_AT_CUSTOMER','DRIVER_DRIVER_ASSIGNED') then 'high' else 'default' end,
             'ttl',case when n.notification_type='DRIVER_OFFER' then 20 else 86400 end,
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
