drop policy if exists products_public_read on public.products;

create policy products_public_read
on public.products
for select
to authenticated
using (
  (
    active = true
    and available_delivery = true
    and image_url is not null
    and btrim(image_url) <> ''
    and exists (
      select 1
      from public.stores s
      where s.id = products.store_id
        and s.status = 'ACTIVE'
    )
    and (
      category_id is null
      or exists (
        select 1
        from public.categories c
        where c.id = products.category_id
          and c.store_id = products.store_id
          and c.active = true
      )
    )
  )
  or private.is_store_member(store_id)
  or private.is_admin()
);
