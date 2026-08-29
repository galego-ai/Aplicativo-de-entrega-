drop policy if exists reviews_customer_insert on public.reviews;
create policy reviews_customer_insert on public.reviews
for insert to authenticated
with check (
  (select auth.uid()) = customer_id
  and exists (
    select 1 from public.orders o
    where o.id = reviews.order_id
      and o.customer_id = (select auth.uid())
      and o.store_id = reviews.store_id
      and o.status = 'DELIVERED'
  )
  and (
    driver_id is null
    or exists (
      select 1 from public.deliveries d
      where d.order_id = reviews.order_id
        and d.driver_id = reviews.driver_id
        and d.status = 'DELIVERED'
    )
  )
);
