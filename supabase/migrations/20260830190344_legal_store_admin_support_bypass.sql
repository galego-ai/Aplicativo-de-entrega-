create or replace function private.enforce_store_legal_consent_on_order_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_store_id uuid; v_global_role text;
begin
  if new.changed_by is null then return new; end if;
  select coalesce(u.raw_app_meta_data->>'clickfood_role','') into v_global_role
    from auth.users u where u.id=new.changed_by;
  if v_global_role in ('SUPER_ADMIN','ADMIN','SUPPORT') then return new; end if;
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
