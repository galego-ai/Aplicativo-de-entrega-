create or replace function private.can_manage_store(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.store_memberships sm
    where sm.store_id = target_store
      and sm.user_id = (select auth.uid())
      and sm.active = true
      and sm.role in ('OWNER','MANAGER')
  ) or private.is_admin();
$$;
revoke all on function private.can_manage_store(uuid) from public;
grant execute on function private.can_manage_store(uuid) to authenticated;

grant insert, update, delete on public.categories, public.products, public.store_delivery_settings, public.store_business_hours, public.delivery_fee_ranges to authenticated;

drop policy if exists categories_manage_store on public.categories;
create policy categories_manage_store on public.categories for all to authenticated
using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));

drop policy if exists products_manage_store on public.products;
create policy products_manage_store on public.products for all to authenticated
using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));

drop policy if exists delivery_settings_manage_store on public.store_delivery_settings;
create policy delivery_settings_manage_store on public.store_delivery_settings for all to authenticated
using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));

drop policy if exists business_hours_manage_store on public.store_business_hours;
create policy business_hours_manage_store on public.store_business_hours for all to authenticated
using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));

drop policy if exists delivery_ranges_manage_store on public.delivery_fee_ranges;
create policy delivery_ranges_manage_store on public.delivery_fee_ranges for all to authenticated
using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));
