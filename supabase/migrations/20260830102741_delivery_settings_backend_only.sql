revoke insert, update, delete on public.store_delivery_settings from authenticated;
revoke insert, update, delete on public.delivery_fee_ranges from authenticated;
grant select on public.store_delivery_settings to authenticated;
grant select on public.delivery_fee_ranges to authenticated;
