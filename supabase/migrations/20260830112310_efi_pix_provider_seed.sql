create unique index if not exists ux_efi_pix_charges_payment on public.efi_pix_charges(payment_id);
insert into public.payment_provider_configs(provider,display_name,environment,enabled,credentials_configured,supported_methods,notes)
values('EFI','Efí Bank','SANDBOX',false,false,array['PIX']::text[],'API Pix Efí preparada. Ative somente após configurar Client ID, Client Secret, certificado PEM, chave privada PEM, chave Pix e HMAC de webhook nos Secrets do backend.')
on conflict(provider) do update set display_name=excluded.display_name,supported_methods=excluded.supported_methods,notes=excluded.notes;
