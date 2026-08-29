create index if not exists idx_admin_bootstrap_used_by on public.admin_bootstrap_codes(used_by) where used_by is not null;
create index if not exists idx_store_onboarding_created_by on public.store_onboarding_codes(created_by) where created_by is not null;
create index if not exists idx_store_onboarding_used_by on public.store_onboarding_codes(used_by) where used_by is not null;

drop policy if exists categories_manage_store on public.categories;
create policy categories_insert_store on public.categories for insert to authenticated with check (private.can_manage_store(store_id));
create policy categories_update_store on public.categories for update to authenticated using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));
create policy categories_delete_store on public.categories for delete to authenticated using (private.can_manage_store(store_id));

drop policy if exists products_manage_store on public.products;
create policy products_insert_store on public.products for insert to authenticated with check (private.can_manage_store(store_id));
create policy products_update_store on public.products for update to authenticated using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));
create policy products_delete_store on public.products for delete to authenticated using (private.can_manage_store(store_id));

drop policy if exists delivery_settings_manage_store on public.store_delivery_settings;
create policy delivery_settings_insert_store on public.store_delivery_settings for insert to authenticated with check (private.can_manage_store(store_id));
create policy delivery_settings_update_store on public.store_delivery_settings for update to authenticated using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));
create policy delivery_settings_delete_store on public.store_delivery_settings for delete to authenticated using (private.can_manage_store(store_id));

drop policy if exists business_hours_manage_store on public.store_business_hours;
create policy business_hours_insert_store on public.store_business_hours for insert to authenticated with check (private.can_manage_store(store_id));
create policy business_hours_update_store on public.store_business_hours for update to authenticated using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));
create policy business_hours_delete_store on public.store_business_hours for delete to authenticated using (private.can_manage_store(store_id));

drop policy if exists delivery_ranges_manage_store on public.delivery_fee_ranges;
create policy delivery_ranges_insert_store on public.delivery_fee_ranges for insert to authenticated with check (private.can_manage_store(store_id));
create policy delivery_ranges_update_store on public.delivery_fee_ranges for update to authenticated using (private.can_manage_store(store_id)) with check (private.can_manage_store(store_id));
create policy delivery_ranges_delete_store on public.delivery_fee_ranges for delete to authenticated using (private.can_manage_store(store_id));
