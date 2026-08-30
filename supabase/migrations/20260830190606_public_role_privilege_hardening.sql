revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

revoke all on table public.efi_card_charges from anon, authenticated;
grant select on table public.efi_card_charges to authenticated;
