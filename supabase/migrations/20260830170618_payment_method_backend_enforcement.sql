create or replace function private.enforce_online_payment_method()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.method='CASH' then return new; end if;
  if not exists (
    select 1 from public.payment_provider_configs p
    where p.enabled=true
      and p.credentials_configured=true
      and new.method=any(p.supported_methods)
      and (new.provider is null or new.provider=p.provider or new.provider='UNCONFIGURED')
  ) then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE';
  end if;
  if new.provider is null or new.provider='UNCONFIGURED' then
    select p.provider into new.provider
    from public.payment_provider_configs p
    where p.enabled=true and p.credentials_configured=true and new.method=any(p.supported_methods)
    order by p.updated_at desc limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists payments_enforce_online_method on public.payments;
create trigger payments_enforce_online_method before insert on public.payments for each row execute function private.enforce_online_payment_method();
revoke all on function private.enforce_online_payment_method() from public;
