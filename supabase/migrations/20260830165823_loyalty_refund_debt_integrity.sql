alter table public.customer_loyalty_wallets
  add column if not exists debt_points integer not null default 0;

alter table public.customer_loyalty_wallets
  drop constraint if exists customer_loyalty_wallets_debt_points_check;
alter table public.customer_loyalty_wallets
  add constraint customer_loyalty_wallets_debt_points_check check (debt_points >= 0);

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
  v_inserted uuid;
  v_debt_payment integer := 0;
  v_credit integer := 0;
  v_balance_reverse integer := 0;
  v_debt_needed integer := 0;
  v_redeem record;
  v_return_points integer := 0;
begin
  if new.customer_id is null then return new; end if;

  if new.status='DELIVERED' and old.status is distinct from 'DELIVERED' and new.payment_status='PAID' then
    select * into v_program
      from public.loyalty_programs
     where store_id=new.store_id and active=true
     limit 1;

    if found and v_program.points_per_currency > 0 then
      v_points := floor(greatest(new.subtotal - new.discount,0) * v_program.points_per_currency)::integer;
      if v_points > 0 then
        insert into public.customer_loyalty_wallets(customer_id,store_id,balance,debt_points,updated_at)
        values(new.customer_id,new.store_id,0,0,now())
        on conflict(customer_id,store_id) do update set updated_at=now()
        returning * into v_wallet;

        insert into public.loyalty_transactions(wallet_id,transaction_type,points,order_id)
        values(v_wallet.id,'EARN',v_points,new.id)
        on conflict do nothing
        returning id into v_inserted;

        if v_inserted is not null then
          v_debt_payment := least(v_wallet.debt_points,v_points);
          v_credit := v_points-v_debt_payment;

          update public.customer_loyalty_wallets
             set balance=balance+v_credit,
                 debt_points=greatest(0,debt_points-v_debt_payment),
                 updated_at=now()
           where id=v_wallet.id;

          if v_debt_payment>0 then
            insert into public.loyalty_transactions(wallet_id,transaction_type,points,order_id)
            values(v_wallet.id,'ADJUSTMENT',-v_debt_payment,new.id);
          end if;

          insert into public.notifications(user_id,notification_type,title,body,data)
          values(
            new.customer_id,'LOYALTY_EARNED','Você ganhou pontos!',
            case when v_debt_payment>0
              then format('Seu pedido gerou %s ponto(s). %s foram usados para compensar um estorno anterior e %s ficaram disponíveis.',v_points,v_debt_payment,v_credit)
              else format('Seu pedido gerou %s ponto(s) de fidelidade.',v_points)
            end,
            jsonb_build_object('orderId',new.id,'storeId',new.store_id,'points',v_points,'debtPaid',v_debt_payment,'credited',v_credit)
          );
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

    if coalesce(v_earned,0)>0 then
      select * into v_wallet
        from public.customer_loyalty_wallets
       where customer_id=new.customer_id and store_id=new.store_id
       for update;

      if found then
        insert into public.loyalty_transactions(wallet_id,transaction_type,points,order_id)
        values(v_wallet.id,'REVERSAL',-v_earned,new.id)
        on conflict do nothing
        returning id into v_inserted;

        if v_inserted is not null then
          v_balance_reverse := least(v_wallet.balance,v_earned);
          v_debt_needed := v_earned-v_balance_reverse;

          update public.customer_loyalty_wallets
             set balance=balance-v_balance_reverse,updated_at=now()
           where id=v_wallet.id;

          if v_debt_needed>0 then
            for v_redeem in
              select r.id,r.coupon_id,r.points_spent
                from public.customer_loyalty_redemptions r
               where r.wallet_id=v_wallet.id and r.status='AVAILABLE'
               order by r.created_at desc,r.id
               for update
            loop
              exit when v_debt_needed<=0;
              update public.customer_loyalty_redemptions set status='CANCELLED' where id=v_redeem.id;
              update public.coupons set active=false where id=v_redeem.coupon_id;

              if v_redeem.points_spent>v_debt_needed then
                v_return_points := v_redeem.points_spent-v_debt_needed;
                update public.customer_loyalty_wallets
                   set balance=balance+v_return_points,updated_at=now()
                 where id=v_wallet.id;
                insert into public.loyalty_transactions(wallet_id,transaction_type,points,reward_id)
                select v_wallet.id,'ADJUSTMENT',v_return_points,r.reward_id
                  from public.customer_loyalty_redemptions r where r.id=v_redeem.id;
                v_debt_needed := 0;
              else
                v_debt_needed := v_debt_needed-v_redeem.points_spent;
              end if;
            end loop;
          end if;

          if v_debt_needed>0 then
            update public.customer_loyalty_wallets
               set debt_points=debt_points+v_debt_needed,updated_at=now()
             where id=v_wallet.id;
          end if;

          insert into public.notifications(user_id,notification_type,title,body,data)
          values(
            new.customer_id,'LOYALTY_REVERSED','Pontos ajustados após estorno',
            case when v_debt_needed>0
              then format('%s ponto(s) foram revertidos. Benefícios ainda não usados foram cancelados e %s ponto(s) serão compensados nos próximos ganhos.',v_earned,v_debt_needed)
              else format('%s ponto(s) foram revertidos após o estorno. Recompensas ainda não usadas relacionadas ao saldo foram ajustadas.',v_earned)
            end,
            jsonb_build_object('orderId',new.id,'storeId',new.store_id,'pointsReversed',v_earned,'debtPoints',v_debt_needed)
          );
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_customer_loyalty_from_order() from public;
