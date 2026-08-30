create unique index if not exists loyalty_transactions_earn_order_once
on public.loyalty_transactions(order_id)
where order_id is not null and transaction_type='EARN';

create unique index if not exists loyalty_transactions_reversal_order_once
on public.loyalty_transactions(order_id)
where order_id is not null and transaction_type='REVERSAL';

create or replace function private.sync_customer_loyalty_from_order()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_program public.loyalty_programs%rowtype;
  v_wallet public.customer_loyalty_wallets%rowtype;
  v_points integer;
  v_earned integer;
  v_reverse integer;
  v_inserted uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.status='DELIVERED' and old.status is distinct from 'DELIVERED' and new.payment_status='PAID' then
    select * into v_program
      from public.loyalty_programs
     where store_id=new.store_id and active=true
     limit 1;

    if found and v_program.points_per_currency > 0 then
      v_points := floor(greatest(new.subtotal - new.discount, 0) * v_program.points_per_currency)::integer;
      if v_points > 0 then
        insert into public.customer_loyalty_wallets(customer_id,store_id,balance,updated_at)
        values(new.customer_id,new.store_id,0,now())
        on conflict(customer_id,store_id) do update set updated_at=now()
        returning * into v_wallet;

        insert into public.loyalty_transactions(wallet_id,transaction_type,points,order_id)
        values(v_wallet.id,'EARN',v_points,new.id)
        on conflict do nothing
        returning id into v_inserted;

        if v_inserted is not null then
          update public.customer_loyalty_wallets
             set balance=balance+v_points,updated_at=now()
           where id=v_wallet.id;

          insert into public.notifications(user_id,notification_type,title,body,data)
          values(new.customer_id,'LOYALTY_EARNED','Você ganhou pontos!',
                 format('Seu pedido gerou %s ponto(s) de fidelidade.',v_points),
                 jsonb_build_object('orderId',new.id,'storeId',new.store_id,'points',v_points));
        end if;
      end if;
    end if;
  end if;

  if new.status='REFUNDED' and old.status is distinct from 'REFUNDED' then
    select lt.points into v_earned
      from public.loyalty_transactions lt
      join public.customer_loyalty_wallets w on w.id=lt.wallet_id
     where lt.order_id=new.id
       and lt.transaction_type='EARN'
       and w.customer_id=new.customer_id
       and w.store_id=new.store_id
     limit 1;

    if coalesce(v_earned,0) > 0 then
      select * into v_wallet
        from public.customer_loyalty_wallets
       where customer_id=new.customer_id and store_id=new.store_id
       for update;

      if found then
        v_reverse := least(v_wallet.balance,v_earned);
        if v_reverse > 0 then
          insert into public.loyalty_transactions(wallet_id,transaction_type,points,order_id)
          values(v_wallet.id,'REVERSAL',-v_reverse,new.id)
          on conflict do nothing
          returning id into v_inserted;

          if v_inserted is not null then
            update public.customer_loyalty_wallets
               set balance=greatest(0,balance-v_reverse),updated_at=now()
             where id=v_wallet.id;

            insert into public.notifications(user_id,notification_type,title,body,data)
            values(new.customer_id,'LOYALTY_REVERSED','Pontos ajustados',
                   format('%s ponto(s) foram revertidos após o estorno do pedido.',v_reverse),
                   jsonb_build_object('orderId',new.id,'storeId',new.store_id,'points',v_reverse));
          end if;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_customer_loyalty_sync on public.orders;
create trigger orders_customer_loyalty_sync
after update of status,payment_status on public.orders
for each row execute function private.sync_customer_loyalty_from_order();

create or replace function public.confirm_delivery_atomic(p_delivery_id uuid, p_driver_id uuid)
returns public.deliveries
language plpgsql
set search_path=''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_order public.orders%rowtype;
  v_cash_payment public.payments%rowtype;
begin
  select * into v_delivery from public.deliveries where id=p_delivery_id for update;
  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id <> p_driver_id then raise exception 'DELIVERY_DRIVER_MISMATCH'; end if;
  if v_delivery.status <> 'DRIVER_AT_CUSTOMER' then raise exception 'DELIVERY_NOT_AT_CUSTOMER'; end if;

  select * into v_order from public.orders where id=v_delivery.order_id for update;
  if v_order.status <> 'ON_THE_WAY' then raise exception 'ORDER_STATUS_CHANGED'; end if;

  select * into v_cash_payment
    from public.payments
   where order_id=v_order.id and method='CASH'
   order by created_at desc
   limit 1
   for update;

  if found and v_cash_payment.status in ('PENDING','PROCESSING') then
    update public.payments
       set status='PAID',paid_at=coalesce(paid_at,now())
     where id=v_cash_payment.id;
  end if;

  update public.deliveries
     set status='DELIVERED',delivered_at=coalesce(delivered_at,now()),updated_at=now()
   where id=v_delivery.id
   returning * into v_delivery;

  update public.orders
     set status='DELIVERED',
         payment_status=case when v_cash_payment.id is not null then 'PAID' else payment_status end,
         delivered_at=coalesce(delivered_at,now()),
         updated_at=now()
   where id=v_order.id;

  insert into public.order_status_history(order_id,status,changed_by,reason)
  values(v_order.id,'DELIVERED',null,'Entrega confirmada por código');

  return v_delivery;
end;
$$;
