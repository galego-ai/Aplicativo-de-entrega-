-- CLICK-FOOD: o cliente só pode ler a localização do entregador depois que ele sai do restaurante.
-- Lojistas continuam podendo acompanhar a operação da própria loja e a Matriz mantém visão administrativa.
drop policy if exists driver_locations_select_scope on public.driver_locations;
create policy driver_locations_select_scope on public.driver_locations
for select to authenticated
using (
  exists (
    select 1
    from public.drivers d
    where d.id = driver_id
      and d.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.deliveries dl
    join public.orders o on o.id = dl.order_id
    where dl.driver_id = driver_locations.driver_id
      and dl.status not in ('DELIVERED','DELIVERY_CANCELLED')
      and (
        private.is_store_member(o.store_id)
        or (
          (select auth.uid()) = o.customer_id
          and dl.status in ('DRIVER_TO_CUSTOMER','DRIVER_AT_CUSTOMER')
        )
      )
  )
  or private.is_admin()
);
