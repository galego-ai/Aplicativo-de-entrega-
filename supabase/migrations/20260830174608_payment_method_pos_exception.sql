create or replace function private.enforce_online_payment_method()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.method='CASH' then return new; end if;

  if new.provider='POS' then
    if exists(select 1 from public.orders o where o.id=new.order_id and o.source='POS') then
      return new;
    end if;
    raise exception 'PAYMENT_PROVIDER_MISMATCH';
  end if;

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
    where p.enabled=true
      and p.credentials_configured=true
      and new.method=any(p.supported_methods)
    order by p.updated_at desc
    limit 1;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_online_payment_method() from public;
