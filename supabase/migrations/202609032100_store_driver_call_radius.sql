alter table public.store_delivery_settings
  add column if not exists driver_call_radius_km numeric not null default 5;

alter table public.store_delivery_settings
  drop constraint if exists store_delivery_settings_driver_call_radius_km_check;

alter table public.store_delivery_settings
  add constraint store_delivery_settings_driver_call_radius_km_check
  check (driver_call_radius_km > 0 and driver_call_radius_km <= 200);

comment on column public.store_delivery_settings.driver_call_radius_km is
  'Raio máximo em km, a partir da loja, para ofertar chamadas aos entregadores CLICK-FOOD. O despacho também respeita o limite máximo configurado pela Matriz para a cidade.';
