create table if not exists public.customer_saved_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'EFI' check (provider='EFI'),
  brand text not null,
  card_mask text not null,
  holder_name text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customer_saved_cards_user_mask_active_idx on public.customer_saved_cards(user_id,provider,brand,card_mask) where active=true;
create unique index if not exists customer_saved_cards_one_default_idx on public.customer_saved_cards(user_id) where active=true and is_default=true;

create table if not exists private.customer_saved_card_tokens (
  card_id uuid primary key references public.customer_saved_cards(id) on delete cascade,
  payment_token text not null,
  holder_document text,
  customer_email text,
  customer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table private.customer_saved_card_tokens add column if not exists holder_document text;
alter table private.customer_saved_card_tokens add column if not exists customer_email text;
alter table private.customer_saved_card_tokens add column if not exists customer_phone text;

alter table public.customer_saved_cards enable row level security;
revoke all on table public.customer_saved_cards from public,anon,authenticated;
grant select on table public.customer_saved_cards to authenticated;
drop policy if exists customer_saved_cards_read_own on public.customer_saved_cards;
create policy customer_saved_cards_read_own on public.customer_saved_cards for select to authenticated using(user_id=auth.uid() and active=true);

create or replace function public.save_customer_saved_card_v2_atomic(p_user_id uuid,p_payment_token text,p_card_mask text,p_brand text,p_holder_name text,p_holder_document text,p_customer_email text,p_customer_phone text,p_make_default boolean default false)
returns public.customer_saved_cards language plpgsql security definer set search_path=''
as $$
declare v_card public.customer_saved_cards%rowtype;v_default boolean;v_doc text;v_phone text;
begin
 v_doc:=regexp_replace(coalesce(p_holder_document,''),'\D','','g');v_phone:=regexp_replace(coalesce(p_customer_phone,''),'\D','','g');
 if p_user_id is null then raise exception 'USER_REQUIRED';end if;
 if length(coalesce(p_payment_token,''))<10 or length(p_payment_token)>1000 then raise exception 'INVALID_PAYMENT_TOKEN';end if;
 if length(trim(coalesce(p_card_mask,'')))<4 or length(p_card_mask)>40 then raise exception 'INVALID_CARD_MASK';end if;
 if lower(coalesce(p_brand,'')) not in('visa','mastercard','amex','elo') then raise exception 'INVALID_CARD_BRAND';end if;
 if length(v_doc)<>11 then raise exception 'INVALID_HOLDER_DOCUMENT';end if;
 if position('@' in coalesce(p_customer_email,''))=0 then raise exception 'INVALID_EMAIL';end if;
 if length(v_phone)<10 or length(v_phone)>13 then raise exception 'INVALID_PHONE';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,44));
 v_default:=p_make_default or not exists(select 1 from public.customer_saved_cards where user_id=p_user_id and active=true);
 if v_default then update public.customer_saved_cards set is_default=false,updated_at=now() where user_id=p_user_id and active=true and is_default=true;end if;
 select * into v_card from public.customer_saved_cards where user_id=p_user_id and provider='EFI' and brand=lower(p_brand) and card_mask=trim(p_card_mask) and active=true for update;
 if found then update public.customer_saved_cards set holder_name=nullif(trim(p_holder_name),''),is_default=v_default or is_default,updated_at=now() where id=v_card.id returning * into v_card;
 else insert into public.customer_saved_cards(user_id,provider,brand,card_mask,holder_name,is_default) values(p_user_id,'EFI',lower(p_brand),trim(p_card_mask),nullif(trim(p_holder_name),''),v_default) returning * into v_card;end if;
 insert into private.customer_saved_card_tokens(card_id,payment_token,holder_document,customer_email,customer_phone,updated_at) values(v_card.id,p_payment_token,v_doc,lower(trim(p_customer_email)),v_phone,now()) on conflict(card_id) do update set payment_token=excluded.payment_token,holder_document=excluded.holder_document,customer_email=excluded.customer_email,customer_phone=excluded.customer_phone,updated_at=now();
 return v_card;
end $$;

create or replace function public.delete_customer_saved_card_atomic(p_user_id uuid,p_card_id uuid) returns boolean language plpgsql security definer set search_path=''
as $$ declare v_was_default boolean;v_next uuid;begin select is_default into v_was_default from public.customer_saved_cards where id=p_card_id and user_id=p_user_id and active=true for update;if not found then raise exception 'CARD_NOT_FOUND';end if;update public.customer_saved_cards set active=false,is_default=false,updated_at=now() where id=p_card_id;delete from private.customer_saved_card_tokens where card_id=p_card_id;if v_was_default then select id into v_next from public.customer_saved_cards where user_id=p_user_id and active=true order by created_at desc limit 1 for update;if v_next is not null then update public.customer_saved_cards set is_default=true,updated_at=now() where id=v_next;end if;end if;return true;end $$;
create or replace function public.set_default_customer_saved_card_atomic(p_user_id uuid,p_card_id uuid) returns boolean language plpgsql security definer set search_path=''
as $$ begin if not exists(select 1 from public.customer_saved_cards where id=p_card_id and user_id=p_user_id and active=true) then raise exception 'CARD_NOT_FOUND';end if;perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,45));update public.customer_saved_cards set is_default=false,updated_at=now() where user_id=p_user_id and active=true and is_default=true;update public.customer_saved_cards set is_default=true,updated_at=now() where id=p_card_id;return true;end $$;
create or replace function public.service_customer_saved_card_data(p_user_id uuid,p_card_id uuid) returns jsonb language sql security definer set search_path=''
as $$ select jsonb_build_object('paymentToken',t.payment_token,'holderDocument',t.holder_document,'email',t.customer_email,'phone',t.customer_phone,'holderName',c.holder_name,'brand',c.brand,'cardMask',c.card_mask) from private.customer_saved_card_tokens t join public.customer_saved_cards c on c.id=t.card_id where c.id=p_card_id and c.user_id=p_user_id and c.active=true;$$;

revoke all on function public.save_customer_saved_card_v2_atomic(uuid,text,text,text,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.delete_customer_saved_card_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_default_customer_saved_card_atomic(uuid,uuid) from public,anon,authenticated;
revoke all on function public.service_customer_saved_card_data(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_customer_saved_card_v2_atomic(uuid,text,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.delete_customer_saved_card_atomic(uuid,uuid) to service_role;
grant execute on function public.set_default_customer_saved_card_atomic(uuid,uuid) to service_role;
grant execute on function public.service_customer_saved_card_data(uuid,uuid) to service_role;
