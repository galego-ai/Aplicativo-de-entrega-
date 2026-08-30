create table if not exists public.customer_loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.customer_loyalty_wallets(id) on delete restrict,
  reward_id uuid not null references public.loyalty_rewards(id) on delete restrict,
  coupon_id uuid not null unique references public.coupons(id) on delete restrict,
  points_spent integer not null check (points_spent > 0),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','USED','CANCELLED','EXPIRED')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_loyalty_redemptions_wallet_idx
  on public.customer_loyalty_redemptions(wallet_id,created_at desc);
create index if not exists customer_loyalty_redemptions_status_expiry_idx
  on public.customer_loyalty_redemptions(status,expires_at)
  where status='AVAILABLE';

alter table public.customer_loyalty_redemptions enable row level security;

drop policy if exists customer_loyalty_redemptions_scope on public.customer_loyalty_redemptions;
create policy customer_loyalty_redemptions_scope
on public.customer_loyalty_redemptions
for select
to authenticated
using (
  exists (
    select 1
      from public.customer_loyalty_wallets w
     where w.id=customer_loyalty_redemptions.wallet_id
       and (
         (select auth.uid())=w.customer_id
         or private.is_store_member(w.store_id)
         or private.is_admin()
       )
  )
);

create or replace function public.redeem_customer_loyalty_reward_atomic(
  p_customer_id uuid,
  p_reward_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reward public.loyalty_rewards%rowtype;
  v_program public.loyalty_programs%rowtype;
  v_wallet public.customer_loyalty_wallets%rowtype;
  v_coupon_id uuid;
  v_redemption_id uuid;
  v_code text;
  v_discount_type text;
  v_discount_value numeric := 0;
  v_expires_at timestamptz := now() + interval '90 days';
begin
  if p_customer_id is null or p_reward_id is null then
    raise exception 'CUSTOMER_AND_REWARD_REQUIRED';
  end if;

  select * into v_reward
    from public.loyalty_rewards
   where id=p_reward_id
   for update;
  if not found or not v_reward.active then
    raise exception 'LOYALTY_REWARD_NOT_AVAILABLE';
  end if;

  if v_reward.reward_type not in ('DISCOUNT_FIXED','DISCOUNT_PERCENTAGE','FREE_DELIVERY') then
    raise exception 'LOYALTY_REWARD_TYPE_NOT_REDEEMABLE';
  end if;

  select * into v_program
    from public.loyalty_programs
   where id=v_reward.program_id and active=true
   for update;
  if not found then
    raise exception 'LOYALTY_PROGRAM_NOT_ACTIVE';
  end if;

  select * into v_wallet
    from public.customer_loyalty_wallets
   where customer_id=p_customer_id and store_id=v_program.store_id
   for update;
  if not found then
    raise exception 'LOYALTY_WALLET_NOT_FOUND';
  end if;
  if v_wallet.balance < v_reward.points_cost then
    raise exception 'INSUFFICIENT_LOYALTY_POINTS';
  end if;

  if v_reward.reward_type='DISCOUNT_FIXED' then
    if coalesce(v_reward.reward_value,0)<=0 then raise exception 'INVALID_LOYALTY_REWARD_VALUE'; end if;
    v_discount_type := 'FIXED';
    v_discount_value := v_reward.reward_value;
  elsif v_reward.reward_type='DISCOUNT_PERCENTAGE' then
    if coalesce(v_reward.reward_value,0)<=0 or v_reward.reward_value>100 then raise exception 'INVALID_LOYALTY_REWARD_VALUE'; end if;
    v_discount_type := 'PERCENTAGE';
    v_discount_value := v_reward.reward_value;
  else
    v_discount_type := 'FREE_DELIVERY';
    v_discount_value := 0;
  end if;

  v_code := 'CFP' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,13));

  insert into public.coupons(
    store_id,code,discount_type,discount_value,minimum_order,
    max_uses,max_uses_per_customer,starts_at,ends_at,active
  ) values (
    v_program.store_id,v_code,v_discount_type,v_discount_value,0,
    1,1,now(),v_expires_at,true
  ) returning id into v_coupon_id;

  insert into public.coupon_rules(coupon_id,rule_type,rule_value)
  values(v_coupon_id,'CUSTOMER',jsonb_build_object('customer_id',p_customer_id));

  update public.customer_loyalty_wallets
     set balance=balance-v_reward.points_cost,updated_at=now()
   where id=v_wallet.id;

  insert into public.loyalty_transactions(wallet_id,transaction_type,points,reward_id)
  values(v_wallet.id,'REDEEM',-v_reward.points_cost,v_reward.id);

  insert into public.customer_loyalty_redemptions(
    wallet_id,reward_id,coupon_id,points_spent,status,expires_at
  ) values (
    v_wallet.id,v_reward.id,v_coupon_id,v_reward.points_cost,'AVAILABLE',v_expires_at
  ) returning id into v_redemption_id;

  insert into public.notifications(user_id,notification_type,title,body,data)
  values(
    p_customer_id,
    'LOYALTY_REDEEMED',
    'Recompensa resgatada!',
    format('Use o cupom %s no seu próximo pedido nesta loja.',v_code),
    jsonb_build_object('rewardId',v_reward.id,'couponId',v_coupon_id,'couponCode',v_code,'pointsSpent',v_reward.points_cost,'expiresAt',v_expires_at)
  );

  return jsonb_build_object(
    'redemptionId',v_redemption_id,
    'couponId',v_coupon_id,
    'couponCode',v_code,
    'rewardName',v_reward.name,
    'pointsSpent',v_reward.points_cost,
    'newBalance',v_wallet.balance-v_reward.points_cost,
    'expiresAt',v_expires_at
  );
end;
$$;

revoke all on function public.redeem_customer_loyalty_reward_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.redeem_customer_loyalty_reward_atomic(uuid,uuid) to service_role;

create or replace function private.mark_loyalty_redemption_used()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.customer_loyalty_redemptions
     set status='USED',used_at=coalesce(used_at,now())
   where coupon_id=new.coupon_id and status='AVAILABLE';
  return new;
end;
$$;

drop trigger if exists coupon_redemption_marks_loyalty_used on public.coupon_redemptions;
create trigger coupon_redemption_marks_loyalty_used
after insert on public.coupon_redemptions
for each row execute function private.mark_loyalty_redemption_used();

create or replace function private.expire_customer_loyalty_redemptions()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select r.id,r.wallet_id,r.coupon_id,r.points_spent,w.customer_id
      from public.customer_loyalty_redemptions r
      join public.customer_loyalty_wallets w on w.id=r.wallet_id
     where r.status='AVAILABLE' and r.expires_at < now()
     for update of r skip locked
  loop
    update public.customer_loyalty_redemptions
       set status='EXPIRED'
     where id=v_row.id and status='AVAILABLE';
    if not found then continue; end if;

    update public.coupons set active=false where id=v_row.coupon_id;
    update public.customer_loyalty_wallets
       set balance=balance+v_row.points_spent,updated_at=now()
     where id=v_row.wallet_id;
    insert into public.loyalty_transactions(wallet_id,transaction_type,points)
    values(v_row.wallet_id,'ADJUSTMENT',v_row.points_spent);
    insert into public.notifications(user_id,notification_type,title,body,data)
    values(
      v_row.customer_id,'LOYALTY_REDEMPTION_EXPIRED','Recompensa expirada',
      format('%s ponto(s) voltaram para sua carteira.',v_row.points_spent),
      jsonb_build_object('redemptionId',v_row.id,'pointsReturned',v_row.points_spent)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_customer_loyalty_redemptions() from public,anon,authenticated;
grant execute on function private.expire_customer_loyalty_redemptions() to service_role;

do $$
begin
  if exists(select 1 from cron.job where jobname='clickfood-expire-loyalty-redemptions') then
    perform cron.unschedule('clickfood-expire-loyalty-redemptions');
  end if;
  perform cron.schedule(
    'clickfood-expire-loyalty-redemptions',
    '17 * * * *',
    'select private.expire_customer_loyalty_redemptions();'
  );
end $$;
