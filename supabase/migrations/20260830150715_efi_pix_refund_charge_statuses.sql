alter table public.efi_pix_charges drop constraint if exists efi_pix_charges_status_check;
alter table public.efi_pix_charges add constraint efi_pix_charges_status_check
check (status = any (array['ACTIVE'::text,'PAID'::text,'EXPIRED'::text,'CANCELLED'::text,'ERROR'::text,'REFUNDED'::text,'PARTIALLY_REFUNDED'::text]));
