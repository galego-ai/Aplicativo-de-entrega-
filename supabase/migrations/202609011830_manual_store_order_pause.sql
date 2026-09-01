alter table public.stores
  add column if not exists orders_paused boolean not null default false;

comment on column public.stores.orders_paused is
  'Pausa operacional definida pelo lojista. Bloqueia somente novos pedidos sem alterar o status administrativo da loja.';

create or replace function private.is_store_open(p_store_id uuid)
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  v_timezone text := 'America/Sao_Paulo';
  v_orders_paused boolean := false;
  v_local timestamp;
  v_dow integer;
  v_time time;
  v_has_schedule boolean;
  v_closed boolean;
  v_opens time;
  v_closes time;
  v_prev_closed boolean;
  v_prev_opens time;
  v_prev_closes time;
begin
  select coalesce(c.timezone,'America/Sao_Paulo'), coalesce(s.orders_paused,false)
    into v_timezone, v_orders_paused
    from public.stores s
    left join public.cities c on c.id=s.city_id
   where s.id=p_store_id;

  if not found then return false; end if;
  if v_orders_paused then return false; end if;

  select exists(select 1 from public.store_business_hours h where h.store_id=p_store_id)
    into v_has_schedule;
  if not v_has_schedule then return true; end if;

  v_local := clock_timestamp() at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_time := v_local::time;

  select h.closed,h.opens_at,h.closes_at
    into v_closed,v_opens,v_closes
    from public.store_business_hours h
   where h.store_id=p_store_id and h.weekday=v_dow;

  if found and not v_closed then
    if v_opens is null and v_closes is null then return true; end if;
    if v_opens is not null and v_closes is not null then
      if v_opens < v_closes and v_time>=v_opens and v_time<v_closes then return true; end if;
      if v_opens > v_closes and v_time>=v_opens then return true; end if;
      if v_opens = v_closes then return true; end if;
    end if;
  end if;

  select h.closed,h.opens_at,h.closes_at
    into v_prev_closed,v_prev_opens,v_prev_closes
    from public.store_business_hours h
   where h.store_id=p_store_id and h.weekday=((v_dow+6)%7);

  if found and not v_prev_closed and v_prev_opens is not null and v_prev_closes is not null
     and v_prev_opens>v_prev_closes and v_time<v_prev_closes then
    return true;
  end if;

  return false;
exception when invalid_parameter_value then
  return false;
end;
$$;