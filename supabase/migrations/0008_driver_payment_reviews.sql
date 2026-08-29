-- CLICK-FOOD: documentos do entregador, pagamentos, repasses e avaliações.

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  document_type text not null check (document_type in ('PROFILE_PHOTO','CNH','VEHICLE_DOCUMENT','IDENTITY','OTHER')),
  file_path text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','EXPIRED')),
  expires_at date,
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('MOTORCYCLE','CAR','BICYCLE','OTHER')),
  brand text,
  model text,
  plate text,
  year integer check (year is null or year between 1950 and 2100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index one_active_vehicle_per_driver on public.driver_vehicles(driver_id) where active = true;

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  request_reference text,
  status text not null,
  error_code text,
  error_message text,
  provider_payload jsonb,
  created_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  provider_refund_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('STORE','DRIVER')),
  store_id uuid references public.stores(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'PIX' check (method in ('PIX','BANK_TRANSFER','OTHER')),
  status text not null default 'REQUESTED' check (status in ('REQUESTED','APPROVED','PROCESSING','PAID','FAILED','REJECTED','CANCELLED')),
  provider_id text,
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  check (
    (recipient_type = 'STORE' and store_id is not null and driver_id is null)
    or (recipient_type = 'DRIVER' and driver_id is not null and store_id is null)
  )
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  store_rating smallint not null check (store_rating between 1 and 5),
  driver_rating smallint check (driver_rating is null or driver_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Códigos nunca são armazenados em texto puro. O backend grava hash e valida hash.
alter table public.deliveries
  add column pickup_code_hash text,
  add column delivery_code_hash text,
  add column pickup_code_expires_at timestamptz,
  add column delivery_code_expires_at timestamptz;

alter table public.driver_documents enable row level security;
alter table public.driver_vehicles enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.refunds enable row level security;
alter table public.payouts enable row level security;
alter table public.reviews enable row level security;

revoke all on public.driver_documents, public.driver_vehicles, public.payment_attempts, public.refunds, public.payouts, public.reviews from anon, authenticated;

grant select on public.driver_documents, public.driver_vehicles to authenticated;
create policy driver_documents_own_read on public.driver_documents for select to authenticated
using (exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid())) or private.is_admin());
create policy driver_vehicles_own_read on public.driver_vehicles for select to authenticated
using (exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid())) or private.is_admin());

grant select on public.payment_attempts, public.refunds to authenticated;
create policy payment_attempts_scope on public.payment_attempts for select to authenticated
using (exists (select 1 from public.payments p join public.orders o on o.id = p.order_id where p.id = payment_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id) or private.is_admin())));
create policy refunds_scope on public.refunds for select to authenticated
using (exists (select 1 from public.payments p join public.orders o on o.id = p.order_id where p.id = payment_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id) or private.is_admin())));

grant select on public.payouts to authenticated;
create policy payouts_scope on public.payouts for select to authenticated
using (
  (store_id is not null and private.is_store_member(store_id))
  or (driver_id is not null and exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid())))
  or private.is_admin()
);

grant select, insert on public.reviews to authenticated;
create policy reviews_order_scope on public.reviews for select to authenticated
using ((select auth.uid()) = customer_id or private.is_store_member(store_id) or (driver_id is not null and exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid()))) or private.is_admin());
create policy reviews_customer_insert on public.reviews for insert to authenticated
with check (
  (select auth.uid()) = customer_id
  and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid()) and o.store_id = store_id and o.status = 'DELIVERED')
);

create index idx_driver_documents_driver on public.driver_documents(driver_id, status);
create index idx_payment_attempts_payment on public.payment_attempts(payment_id, created_at desc);
create index idx_payouts_store on public.payouts(store_id, status, requested_at desc);
create index idx_payouts_driver on public.payouts(driver_id, status, requested_at desc);
