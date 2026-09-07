create or replace function public.enforce_app_payment_governance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_source text;
  v_allowed boolean := false;
  p public.store_payment_permissions%rowtype;
  m public.store_payment_methods%rowtype;
begin
  select o.store_id, o.source into v_store_id, v_source
  from public.orders o
  where o.id = new.order_id;

  if v_store_id is null or coalesce(v_source, 'APP') <> 'APP' then
    return new;
  end if;

  select * into p from public.store_payment_permissions where store_id = v_store_id;
  select * into m from public.store_payment_methods where store_id = v_store_id;

  if p.store_id is null or m.store_id is null then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE';
  end if;

  if new.method = 'CASH' then
    v_allowed := p.cash_allowed and m.cash_enabled;
  elsif new.method = 'PIX' then
    v_allowed := p.pix_allowed and m.pix_enabled and coalesce(new.provider, '') = 'EFI';
  elsif new.method = 'CREDIT_CARD' and coalesce(new.provider, '') = 'EFI' then
    v_allowed := p.credit_card_online_allowed and m.credit_card_online_enabled;
  elsif new.method = 'CREDIT_CARD' and coalesce(new.provider, '') = 'DELIVERY_POS' then
    v_allowed := p.card_on_delivery_allowed and m.card_on_delivery_enabled;
  elsif new.method = 'DEBIT_CARD' and coalesce(new.provider, '') = 'DELIVERY_POS' then
    v_allowed := p.debit_card_on_delivery_allowed and m.debit_card_on_delivery_enabled;
  else
    v_allowed := false;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_app_governance on public.payments;
create trigger payments_enforce_app_governance
before insert on public.payments
for each row execute function public.enforce_app_payment_governance();
