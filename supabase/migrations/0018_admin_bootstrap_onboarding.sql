create table if not exists public.admin_bootstrap_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_bootstrap_codes enable row level security;
revoke all on table public.admin_bootstrap_codes from anon, authenticated;

create table if not exists public.store_onboarding_codes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_store_onboarding_store on public.store_onboarding_codes(store_id, expires_at desc);
alter table public.store_onboarding_codes enable row level security;
revoke all on table public.store_onboarding_codes from anon, authenticated;

create or replace function public.admin_create_store_atomic(
  p_legal_name text,
  p_trade_name text,
  p_document text,
  p_email text,
  p_phone text,
  p_store_name text,
  p_slug text,
  p_city_id uuid,
  p_description text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_created_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_store_id uuid;
begin
  if p_store_name is null or length(trim(p_store_name)) < 2 then
    raise exception 'STORE_NAME_REQUIRED';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'INVALID_SLUG';
  end if;
  if exists (select 1 from public.stores where slug = p_slug) then
    raise exception 'SLUG_ALREADY_EXISTS';
  end if;

  insert into public.organizations(legal_name, trade_name, document, email, phone, status)
  values (trim(p_legal_name), nullif(trim(p_trade_name), ''), nullif(trim(p_document), ''), nullif(trim(p_email), ''), nullif(trim(p_phone), ''), 'ACTIVE')
  returning id into v_org_id;

  insert into public.stores(organization_id, city_id, name, slug, description, document, email, phone, status)
  values (v_org_id, p_city_id, trim(p_store_name), p_slug, nullif(trim(p_description), ''), nullif(trim(p_document), ''), nullif(trim(p_email), ''), nullif(trim(p_phone), ''), 'ACTIVE')
  returning id into v_store_id;

  insert into public.store_delivery_settings(store_id) values (v_store_id) on conflict (store_id) do nothing;
  insert into public.cash_registers(store_id, name, active) values (v_store_id, 'Caixa 01', true);
  insert into public.loyalty_programs(store_id, active, points_per_currency) values (v_store_id, false, 1) on conflict (store_id) do nothing;
  insert into public.store_bonus_wallets(store_id, balance) values (v_store_id, 0) on conflict (store_id) do nothing;
  insert into public.store_onboarding_codes(store_id, code_hash, expires_at, created_by) values (v_store_id, p_code_hash, p_expires_at, p_created_by);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (p_created_by, 'STORE_CREATED', 'store', v_store_id, jsonb_build_object('name', p_store_name, 'slug', p_slug));
  return v_store_id;
end;
$$;
revoke all on function public.admin_create_store_atomic(text,text,text,text,text,text,text,uuid,text,text,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.admin_create_store_atomic(text,text,text,text,text,text,text,uuid,text,text,timestamptz,uuid) to service_role;

create or replace function public.claim_store_atomic(p_code_hash text, p_user_id uuid) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code public.store_onboarding_codes%rowtype;
begin
  select * into v_code from public.store_onboarding_codes where code_hash = p_code_hash for update;
  if v_code.id is null then raise exception 'CODE_NOT_FOUND'; end if;
  if v_code.used_at is not null then raise exception 'CODE_ALREADY_USED'; end if;
  if v_code.expires_at <= now() then raise exception 'CODE_EXPIRED'; end if;

  insert into public.store_memberships(store_id, user_id, role, active)
  values (v_code.store_id, p_user_id, 'OWNER', true)
  on conflict (store_id, user_id) do update set role = 'OWNER', active = true;

  update public.store_onboarding_codes set used_at = now(), used_by = p_user_id where id = v_code.id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after_data)
  values (p_user_id, 'STORE_ONBOARDING_CLAIMED', 'store', v_code.store_id, jsonb_build_object('membership_role', 'OWNER'));
  return v_code.store_id;
end;
$$;
revoke all on function public.claim_store_atomic(text,uuid) from public, anon, authenticated;
grant execute on function public.claim_store_atomic(text,uuid) to service_role;
