create table if not exists public.payment_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  display_name text not null,
  environment text not null default 'SANDBOX' check (environment in ('SANDBOX','PRODUCTION')),
  enabled boolean not null default false,
  credentials_configured boolean not null default false,
  supported_methods text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payment_provider_configs enable row level security;
revoke all on public.payment_provider_configs from anon, authenticated;
grant select on public.payment_provider_configs to authenticated;
drop policy if exists payment_provider_configs_admin_read on public.payment_provider_configs;
create policy payment_provider_configs_admin_read on public.payment_provider_configs for select to authenticated using (private.is_admin());
