drop policy if exists efi_pix_charges_customer_read on public.efi_pix_charges;
drop policy if exists efi_pix_charges_store_read on public.efi_pix_charges;
drop policy if exists efi_pix_charges_admin_read on public.efi_pix_charges;

create policy efi_pix_charges_read_scope on public.efi_pix_charges
for select to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = efi_pix_charges.order_id
      and o.customer_id = (select auth.uid())
  )
  or exists (
    select 1 from public.orders o
    join public.store_memberships sm on sm.store_id = o.store_id
    where o.id = efi_pix_charges.order_id
      and sm.user_id = (select auth.uid())
      and sm.active = true
  )
);
