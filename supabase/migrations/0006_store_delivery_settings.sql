-- CLICK-FOOD: horários e configuração de entrega por loja.

create table public.store_business_hours (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, weekday)
);

create table public.store_delivery_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  pickup_enabled boolean not null default true,
  own_delivery_enabled boolean not null default false,
  clickfood_delivery_enabled boolean not null default true,
  pricing_model text not null default 'DISTANCE' check (pricing_model in ('FREE','FIXED','DISTANCE')),
  fixed_fee numeric(12,2) not null default 0 check (fixed_fee >= 0),
  base_fee numeric(12,2) not null default 0 check (base_fee >= 0),
  per_km_fee numeric(12,2) not null default 0 check (per_km_fee >= 0),
  minimum_fee numeric(12,2) not null default 0 check (minimum_fee >= 0),
  max_radius_km numeric(8,2) check (max_radius_km is null or max_radius_km > 0),
  updated_at timestamptz not null default now()
);

create table public.delivery_fee_ranges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  min_km numeric(8,2) not null check (min_km >= 0),
  max_km numeric(8,2) not null check (max_km > min_km),
  fee numeric(12,2) not null check (fee >= 0),
  active boolean not null default true,
  unique (store_id, min_km, max_km)
);

create table public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  address_id uuid not null references public.customer_addresses(id) on delete cascade,
  distance_km numeric(8,2) not null check (distance_km >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  fee numeric(12,2) not null check (fee >= 0),
  provider text,
  provider_reference text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_delivery_quotes_customer on public.delivery_quotes(customer_id, expires_at desc);

alter table public.store_business_hours enable row level security;
alter table public.store_delivery_settings enable row level security;
alter table public.delivery_fee_ranges enable row level security;
alter table public.delivery_quotes enable row level security;

revoke all on public.store_business_hours, public.store_delivery_settings, public.delivery_fee_ranges, public.delivery_quotes from anon, authenticated;

grant select on public.store_business_hours, public.store_delivery_settings, public.delivery_fee_ranges to anon, authenticated;
grant select on public.delivery_quotes to authenticated;

create policy business_hours_public_read on public.store_business_hours for select to anon, authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.status = 'ACTIVE') or private.is_store_member(store_id) or private.is_admin());

create policy delivery_settings_public_read on public.store_delivery_settings for select to anon, authenticated
using (exists (select 1 from public.stores s where s.id = store_id and s.status = 'ACTIVE') or private.is_store_member(store_id) or private.is_admin());

create policy delivery_ranges_public_read on public.delivery_fee_ranges for select to anon, authenticated
using (active = true and exists (select 1 from public.stores s where s.id = store_id and s.status = 'ACTIVE') or private.is_store_member(store_id) or private.is_admin());

create policy delivery_quotes_own_read on public.delivery_quotes for select to authenticated
using (customer_id = (select auth.uid()) or private.is_admin());
