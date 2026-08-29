-- CLICK-FOOD: schema inicial independente do CLICK-GO
-- Projetado para Supabase/Postgres 17 com RLS em todas as tabelas public expostas.

create extension if not exists pgcrypto;
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Identidade e autorização
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  document text,
  email text,
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','BLOCKED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  country text not null default 'BR',
  active boolean not null default true,
  unique (name, state, country)
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  city_id uuid references public.cities(id) on delete set null,
  name text not null,
  slug text not null unique,
  document text,
  phone text,
  email text,
  logo_url text,
  cover_url text,
  description text,
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','PAUSED','SUSPENDED','BLOCKED','CANCELLED')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  average_preparation_time integer not null default 30 check (average_preparation_time between 1 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','MANAGER','CASHIER','KITCHEN','EXPEDITION')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, user_id)
);

-- Autorização administrativa usa app_metadata, nunca user_metadata.
create or replace function private.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'clickfood_role') in ('SUPER_ADMIN','ADMIN','SUPPORT'), false);
$$;

create or replace function private.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.store_memberships sm
    where sm.store_id = target_store_id
      and sm.user_id = auth.uid()
      and sm.active = true
  );
$$;

revoke all on function private.is_store_member(uuid) from public;
grant execute on function private.is_store_member(uuid) to authenticated;
grant execute on function private.is_admin() to anon, authenticated;

-- Cria profile automaticamente quando um usuário Auth nasce.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  sku text,
  barcode text,
  price numeric(12,2) not null check (price >= 0),
  promotional_price numeric(12,2) check (promotional_price is null or promotional_price >= 0),
  active boolean not null default true,
  available_delivery boolean not null default true,
  available_pos boolean not null default true,
  control_inventory boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.option_groups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  minimum_choices integer not null default 0 check (minimum_choices >= 0),
  maximum_choices integer not null default 1 check (maximum_choices >= 1),
  active boolean not null default true,
  check (minimum_choices <= maximum_choices)
);

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.option_groups(id) on delete cascade,
  name text not null,
  additional_price numeric(12,2) not null default 0 check (additional_price >= 0),
  active boolean not null default true
);

create table public.product_option_groups (
  product_id uuid not null references public.products(id) on delete cascade,
  option_group_id uuid not null references public.option_groups(id) on delete cascade,
  primary key (product_id, option_group_id)
);

-- -----------------------------------------------------------------------------
-- Estoque
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  minimum_quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (store_id, product_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('PURCHASE','SALE','ADJUSTMENT','LOSS','RETURN','CANCELLATION')),
  quantity numeric(14,3) not null,
  previous_quantity numeric(14,3) not null,
  new_quantity numeric(14,3) not null,
  reference_type text,
  reference_id uuid,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Pedidos e pagamentos
-- -----------------------------------------------------------------------------
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  postal_code text,
  street text not null,
  number text,
  complement text,
  district text,
  city_id uuid references public.cities(id) on delete set null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  reference text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  address_id uuid references public.customer_addresses(id) on delete set null,
  source text not null default 'APP' check (source in ('APP','POS','PHONE','MANUAL')),
  delivery_type text not null default 'DELIVERY' check (delivery_type in ('DELIVERY','PICKUP','COUNTER')),
  status text not null default 'WAITING_STORE' check (status in ('PENDING_PAYMENT','WAITING_STORE','ACCEPTED','PREPARING','READY','WAITING_DRIVER','DRIVER_ASSIGNED','PICKED_UP','ON_THE_WAY','DELIVERED','REJECTED','CANCELLED','PAYMENT_FAILED','REFUNDED')),
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING','PAID','FAILED','REFUNDED','PARTIALLY_REFUNDED','CANCELLED')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  customer_notes text,
  estimated_delivery_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_price numeric(12,2) not null check (total_price >= 0),
  notes text
);

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  option_name_snapshot text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  quantity numeric(12,3) not null default 1 check (quantity > 0)
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text,
  method text not null check (method in ('PIX','CREDIT_CARD','DEBIT_CARD','CASH','WALLET','OTHER')),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED')),
  provider_transaction_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Entregadores e logística
-- -----------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','SUSPENDED','BLOCKED','REJECTED')),
  online boolean not null default false,
  rating numeric(3,2) not null default 5 check (rating between 0 and 5),
  acceptance_rate numeric(5,2) not null default 100 check (acceptance_rate between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  status text not null default 'SEARCHING_DRIVER' check (status in ('SEARCHING_DRIVER','OFFER_SENT','DRIVER_ASSIGNED','DRIVER_TO_STORE','DRIVER_AT_STORE','PICKUP_CONFIRMED','DRIVER_TO_CUSTOMER','DRIVER_AT_CUSTOMER','DELIVERED','DELIVERY_CANCELLED','CUSTOMER_UNAVAILABLE','RETURN_REQUIRED','INCIDENT')),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  driver_earning numeric(12,2) not null default 0 check (driver_earning >= 0),
  pickup_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','EXPIRED')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  unique (delivery_id, driver_id, offered_at)
);

create table public.driver_locations (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  heading numeric(6,2),
  speed numeric(8,2),
  accuracy numeric(8,2),
  recorded_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Financeiro e auditoria
-- -----------------------------------------------------------------------------
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  driver_id uuid references public.drivers(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('ORDER_SALE','PLATFORM_COMMISSION','DELIVERY_FEE','DRIVER_EARNING','REFUND','PAYOUT','SUBSCRIPTION','BONUS_CREDIT')),
  direction text not null check (direction in ('CREDIT','DEBIT')),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'POSTED' check (status in ('PENDING','POSTED','VOID')),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
create index idx_store_memberships_user on public.store_memberships(user_id, active);
create index idx_categories_store on public.categories(store_id, active);
create index idx_products_store on public.products(store_id, active);
create index idx_orders_store_created on public.orders(store_id, created_at desc);
create index idx_orders_customer_created on public.orders(customer_id, created_at desc);
create index idx_order_items_order on public.order_items(order_id);
create index idx_status_history_order on public.order_status_history(order_id, created_at);
create index idx_delivery_offers_driver on public.delivery_offers(driver_id, status, expires_at);
create index idx_financial_store_created on public.financial_transactions(store_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS + grants explícitos
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.cities enable row level security;
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.option_groups enable row level security;
alter table public.product_options enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_options enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.drivers enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_offers enable row level security;
alter table public.driver_locations enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Catálogo público: somente leitura de cidades/lojas/produtos ativos.
grant select on public.cities, public.stores, public.categories, public.products, public.option_groups, public.product_options, public.product_option_groups to anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant select on public.store_memberships to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select on public.orders, public.order_items, public.order_item_options, public.order_status_history, public.payments to authenticated;
grant select on public.drivers, public.deliveries, public.delivery_offers, public.driver_locations to authenticated;
grant insert, update on public.driver_locations to authenticated;
grant select on public.inventory_items, public.inventory_movements, public.financial_transactions to authenticated;

-- Perfis
create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id or private.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id or private.is_admin())
with check ((select auth.uid()) = id or private.is_admin());

-- Catálogo público
create policy cities_public_read on public.cities for select to anon, authenticated using (active = true or private.is_admin());
create policy stores_public_read on public.stores for select to anon, authenticated using (status = 'ACTIVE' or private.is_store_member(id) or private.is_admin());
create policy categories_public_read on public.categories for select to anon, authenticated using (active = true and exists (select 1 from public.stores s where s.id = store_id and s.status = 'ACTIVE') or private.is_store_member(store_id) or private.is_admin());
create policy products_public_read on public.products for select to anon, authenticated using (active = true and exists (select 1 from public.stores s where s.id = store_id and s.status = 'ACTIVE') or private.is_store_member(store_id) or private.is_admin());
create policy option_groups_public_read on public.option_groups for select to anon, authenticated using (active = true or private.is_store_member(store_id) or private.is_admin());
create policy product_options_public_read on public.product_options for select to anon, authenticated using (active = true or private.is_admin());
create policy product_option_groups_public_read on public.product_option_groups for select to anon, authenticated using (true);

-- Membresias
create policy memberships_self_or_admin on public.store_memberships for select to authenticated
using ((select auth.uid()) = user_id or private.is_admin());
create policy organizations_member_read on public.organizations for select to authenticated
using (exists (select 1 from public.stores s join public.store_memberships sm on sm.store_id = s.id where s.organization_id = organizations.id and sm.user_id = (select auth.uid()) and sm.active) or private.is_admin());

-- Endereços do cliente
create policy addresses_select_own on public.customer_addresses for select to authenticated using ((select auth.uid()) = user_id);
create policy addresses_insert_own on public.customer_addresses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy addresses_update_own on public.customer_addresses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy addresses_delete_own on public.customer_addresses for delete to authenticated using ((select auth.uid()) = user_id);

-- Pedidos: cliente, loja autorizada ou matriz.
create policy orders_read_scope on public.orders for select to authenticated
using ((select auth.uid()) = customer_id or private.is_store_member(store_id) or private.is_admin());
create policy order_items_read_scope on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id) or private.is_admin())));
create policy order_item_options_read_scope on public.order_item_options for select to authenticated
using (exists (select 1 from public.order_items oi join public.orders o on o.id = oi.order_id where oi.id = order_item_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id) or private.is_admin())));
create policy status_history_read_scope on public.order_status_history for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id) or private.is_admin())));
create policy payments_read_scope on public.payments for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id) or private.is_admin())));

-- Entregador
create policy drivers_read_own_or_admin on public.drivers for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());
create policy delivery_offers_driver_read on public.delivery_offers for select to authenticated
using (exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid())) or private.is_admin());
create policy deliveries_read_scope on public.deliveries for select to authenticated
using (
  exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid()))
  or exists (select 1 from public.orders o where o.id = order_id and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id)))
  or private.is_admin()
);
create policy driver_locations_select_scope on public.driver_locations for select to authenticated
using (
  exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid()))
  or exists (select 1 from public.deliveries dl join public.orders o on o.id = dl.order_id where dl.driver_id = driver_locations.driver_id and dl.status not in ('DELIVERED','DELIVERY_CANCELLED') and ((select auth.uid()) = o.customer_id or private.is_store_member(o.store_id)))
  or private.is_admin()
);
create policy driver_locations_insert_own on public.driver_locations for insert to authenticated
with check (exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid()) and d.status = 'ACTIVE'));
create policy driver_locations_update_own on public.driver_locations for update to authenticated
using (exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid())))
with check (exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = (select auth.uid()) and d.status = 'ACTIVE'));

-- Operação da loja: leitura interna. Escritas críticas serão feitas por backend/Edge Functions.
create policy inventory_items_store_read on public.inventory_items for select to authenticated using (private.is_store_member(store_id) or private.is_admin());
create policy inventory_movements_store_read on public.inventory_movements for select to authenticated using (private.is_store_member(store_id) or private.is_admin());
create policy financial_store_read on public.financial_transactions for select to authenticated using ((store_id is not null and private.is_store_member(store_id)) or private.is_admin());

-- Auditoria fica inacessível a clientes comuns. Somente administradores via Data API.
grant select on public.audit_logs to authenticated;
create policy audit_admin_read on public.audit_logs for select to authenticated using (private.is_admin());

-- Sequência do número do pedido precisa ser legível pelo papel autenticado apenas quando necessário via backend.
revoke all on all sequences in schema public from anon, authenticated;
