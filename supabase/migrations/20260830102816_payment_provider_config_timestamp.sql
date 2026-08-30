create or replace function private.touch_payment_provider_config_updated_at()
returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists trg_payment_provider_configs_updated_at on public.payment_provider_configs;
create trigger trg_payment_provider_configs_updated_at before update on public.payment_provider_configs for each row execute function private.touch_payment_provider_config_updated_at();
