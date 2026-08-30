-- CLICK-FOOD: índices das FKs de incidentes usados por operação, auditoria e resolução.

create index if not exists delivery_incidents_driver_idx
  on public.delivery_incidents(driver_id)
  where driver_id is not null;

create index if not exists delivery_incidents_order_idx
  on public.delivery_incidents(order_id)
  where order_id is not null;

create index if not exists delivery_incidents_resolved_by_idx
  on public.delivery_incidents(resolved_by)
  where resolved_by is not null;
