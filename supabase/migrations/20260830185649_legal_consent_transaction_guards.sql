create or replace function private.enforce_customer_legal_consent_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'APP' and new.customer_id is not null
     and not public.has_current_legal_consent(new.customer_id,'CUSTOMER') then
    raise exception 'LEGAL_CONSENT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_require_customer_legal_consent on public.orders;
create trigger orders_require_customer_legal_consent
before insert on public.orders
for each row execute function private.enforce_customer_legal_consent_on_order();

create or replace function private.enforce_driver_legal_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null and not public.has_current_legal_consent(new.user_id,'DRIVER') then
      raise exception 'LEGAL_CONSENT_REQUIRED';
    end if;
  elsif new.online is true and old.online is distinct from new.online then
    if new.user_id is not null and not public.has_current_legal_consent(new.user_id,'DRIVER') then
      raise exception 'LEGAL_CONSENT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists drivers_require_legal_consent on public.drivers;
create trigger drivers_require_legal_consent
before insert or update of online on public.drivers
for each row execute function private.enforce_driver_legal_consent();

create or replace function private.enforce_driver_assignment_legal_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid;
begin
  if new.driver_id is not null and new.driver_id is distinct from old.driver_id then
    select d.user_id into v_user_id from public.drivers d where d.id = new.driver_id;
    if v_user_id is null or not public.has_current_legal_consent(v_user_id,'DRIVER') then
      raise exception 'LEGAL_CONSENT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_require_driver_legal_consent on public.deliveries;
create trigger deliveries_require_driver_legal_consent
before update of driver_id on public.deliveries
for each row execute function private.enforce_driver_assignment_legal_consent();

create or replace function private.enforce_store_legal_consent_on_order_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_store_id uuid;
begin
  if new.changed_by is null then return new; end if;
  select o.store_id into v_store_id from public.orders o where o.id = new.order_id;
  if v_store_id is null then return new; end if;
  if exists (
    select 1 from public.store_memberships m
    where m.store_id = v_store_id and m.user_id = new.changed_by and m.active = true
  ) and not public.has_current_legal_consent(new.changed_by,'STORE') then
    raise exception 'LEGAL_CONSENT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists order_history_require_store_legal_consent on public.order_status_history;
create trigger order_history_require_store_legal_consent
before insert on public.order_status_history
for each row execute function private.enforce_store_legal_consent_on_order_history();
