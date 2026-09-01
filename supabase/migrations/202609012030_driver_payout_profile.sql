create table if not exists public.driver_payout_profiles (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  pix_key_type text not null check (pix_key_type in ('CPF','CNPJ','EMAIL','PHONE','RANDOM')),
  pix_key text not null check (char_length(trim(pix_key)) between 3 and 160),
  updated_at timestamptz not null default now()
);

alter table public.driver_payout_profiles enable row level security;

drop policy if exists driver_payout_profiles_select_own on public.driver_payout_profiles;
create policy driver_payout_profiles_select_own on public.driver_payout_profiles
for select to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.drivers d
    where d.id = driver_payout_profiles.driver_id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists driver_payout_profiles_insert_own on public.driver_payout_profiles;
create policy driver_payout_profiles_insert_own on public.driver_payout_profiles
for insert to authenticated
with check (
  private.is_admin()
  or exists (
    select 1 from public.drivers d
    where d.id = driver_payout_profiles.driver_id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists driver_payout_profiles_update_own on public.driver_payout_profiles;
create policy driver_payout_profiles_update_own on public.driver_payout_profiles
for update to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.drivers d
    where d.id = driver_payout_profiles.driver_id
      and d.user_id = (select auth.uid())
  )
)
with check (
  private.is_admin()
  or exists (
    select 1 from public.drivers d
    where d.id = driver_payout_profiles.driver_id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists driver_payout_profiles_delete_own on public.driver_payout_profiles;
create policy driver_payout_profiles_delete_own on public.driver_payout_profiles
for delete to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.drivers d
    where d.id = driver_payout_profiles.driver_id
      and d.user_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.driver_payout_profiles to authenticated;
revoke all on public.driver_payout_profiles from anon;
