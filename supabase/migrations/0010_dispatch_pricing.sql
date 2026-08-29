-- CLICK-FOOD: configuração da rede de entregadores por cidade.

create table public.city_delivery_pricing (
  city_id uuid primary key references public.cities(id) on delete cascade,
  driver_base_earning numeric(12,2) not null default 4 check (driver_base_earning >= 0),
  driver_per_km numeric(12,2) not null default 1 check (driver_per_km >= 0),
  driver_minimum_earning numeric(12,2) not null default 6 check (driver_minimum_earning >= 0),
  updated_at timestamptz not null default now()
);

create table public.delivery_dispatch_settings (
  city_id uuid primary key references public.cities(id) on delete cascade,
  offer_timeout_seconds integer not null default 15 check (offer_timeout_seconds between 5 and 120),
  initial_radius_km numeric(8,2) not null default 5 check (initial_radius_km > 0),
  max_radius_km numeric(8,2) not null default 20 check (max_radius_km >= initial_radius_km),
  batch_size integer not null default 3 check (batch_size between 1 and 20),
  updated_at timestamptz not null default now()
);

-- Um mesmo entregador não recebe duas ofertas pendentes para a mesma entrega.
create unique index one_pending_offer_per_driver_delivery
on public.delivery_offers(delivery_id, driver_id)
where status = 'PENDING';

alter table public.city_delivery_pricing enable row level security;
alter table public.delivery_dispatch_settings enable row level security;
revoke all on public.city_delivery_pricing, public.delivery_dispatch_settings from anon, authenticated;

-- Matrizes consultam por Data API; lojistas não precisam conhecer a fórmula interna do ganho.
grant select on public.city_delivery_pricing, public.delivery_dispatch_settings to authenticated;
create policy city_pricing_admin_read on public.city_delivery_pricing for select to authenticated using (private.is_admin());
create policy dispatch_settings_admin_read on public.delivery_dispatch_settings for select to authenticated using (private.is_admin());
