alter table public.cities add column if not exists timezone text not null default 'America/Sao_Paulo';

create or replace function private.is_store_open(p_store_id uuid)
returns boolean
language plpgsql
stable
set search_path=''
as $$
declare
  v_timezone text := 'America/Sao_Paulo'; v_local timestamp; v_dow integer; v_time time; v_has_schedule boolean;
  v_closed boolean; v_opens time; v_closes time; v_prev_closed boolean; v_prev_opens time; v_prev_closes time;
begin
  select coalesce(c.timezone,'America/Sao_Paulo') into v_timezone from public.stores s left join public.cities c on c.id=s.city_id where s.id=p_store_id;
  if not found then return false; end if;
  select exists(select 1 from public.store_business_hours h where h.store_id=p_store_id) into v_has_schedule;
  if not v_has_schedule then return true; end if;
  v_local:=clock_timestamp() at time zone v_timezone; v_dow:=extract(dow from v_local)::integer; v_time:=v_local::time;
  select h.closed,h.opens_at,h.closes_at into v_closed,v_opens,v_closes from public.store_business_hours h where h.store_id=p_store_id and h.weekday=v_dow;
  if found and not v_closed then
    if v_opens is null and v_closes is null then return true; end if;
    if v_opens is not null and v_closes is not null then
      if v_opens<v_closes and v_time>=v_opens and v_time<v_closes then return true; end if;
      if v_opens>v_closes and v_time>=v_opens then return true; end if;
      if v_opens=v_closes then return true; end if;
    end if;
  end if;
  select h.closed,h.opens_at,h.closes_at into v_prev_closed,v_prev_opens,v_prev_closes from public.store_business_hours h where h.store_id=p_store_id and h.weekday=((v_dow+6)%7);
  if found and not v_prev_closed and v_prev_opens is not null and v_prev_closes is not null and v_prev_opens>v_prev_closes and v_time<v_prev_closes then return true; end if;
  return false;
exception when invalid_parameter_value then return false;
end;
$$;
revoke all on function private.is_store_open(uuid) from public,anon,authenticated;
grant execute on function private.is_store_open(uuid) to service_role;

create or replace function public.checkout_order_atomic(p_store_id uuid,p_customer_id uuid,p_address_id uuid,p_delivery_quote_id uuid,p_coupon_id uuid,p_source text,p_delivery_type text,p_status text,p_payment_status text,p_payment_method text,p_payment_provider text,p_subtotal numeric,p_delivery_fee numeric,p_discount numeric,p_total numeric,p_customer_notes text,p_items jsonb)
returns uuid language plpgsql set search_path=''
as $$
declare v_order_id uuid;v_order_item_id uuid;v_item jsonb;v_option jsonb;v_quote_updated integer;v_product_id uuid;v_requested_qty numeric;v_control_inventory boolean;v_inventory public.inventory_items%rowtype;v_store_status text;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'EMPTY_CART';end if;
 select status into v_store_status from public.stores where id=p_store_id for share;if not found or v_store_status<>'ACTIVE' then raise exception 'STORE_UNAVAILABLE';end if;if not private.is_store_open(p_store_id) then raise exception 'STORE_CLOSED';end if;
 if p_delivery_type='DELIVERY' then
  if p_delivery_quote_id is null or p_address_id is null then raise exception 'DELIVERY_QUOTE_REQUIRED';end if;
  if not exists(select 1 from public.store_delivery_settings s where s.store_id=p_store_id and (s.clickfood_delivery_enabled or s.own_delivery_enabled)) then raise exception 'DELIVERY_DISABLED';end if;
  update public.delivery_quotes set consumed_at=now() where id=p_delivery_quote_id and store_id=p_store_id and customer_id=p_customer_id and address_id=p_address_id and consumed_at is null and expires_at>now() and fee=p_delivery_fee;get diagnostics v_quote_updated=row_count;if v_quote_updated<>1 then raise exception 'DELIVERY_QUOTE_INVALID_OR_CONSUMED';end if;
 elsif p_delivery_type='PICKUP' then if exists(select 1 from public.store_delivery_settings s where s.store_id=p_store_id and not s.pickup_enabled) then raise exception 'PICKUP_DISABLED';end if;end if;
 insert into public.orders(store_id,customer_id,address_id,source,delivery_type,status,payment_status,subtotal,delivery_fee,discount,total,customer_notes) values(p_store_id,p_customer_id,p_address_id,p_source,p_delivery_type,p_status,p_payment_status,p_subtotal,p_delivery_fee,p_discount,p_total,p_customer_notes) returning id into v_order_id;
 for v_product_id,v_requested_qty in select nullif(value->>'product_id','')::uuid,sum((value->>'quantity')::numeric) from jsonb_array_elements(p_items) group by nullif(value->>'product_id','')::uuid loop
  select control_inventory into v_control_inventory from public.products where id=v_product_id and store_id=p_store_id and active=true for share;if not found then raise exception 'PRODUCT_NOT_AVAILABLE';end if;
  if v_control_inventory then select * into v_inventory from public.inventory_items where store_id=p_store_id and product_id=v_product_id for update;if not found then raise exception 'INVENTORY_NOT_CONFIGURED';end if;if v_inventory.quantity<v_requested_qty then raise exception 'INSUFFICIENT_STOCK';end if;update public.inventory_items set quantity=v_inventory.quantity-v_requested_qty,updated_at=now() where id=v_inventory.id;insert into public.inventory_movements(store_id,product_id,movement_type,quantity,previous_quantity,new_quantity,reference_type,reference_id,reason,created_by) values(p_store_id,v_product_id,'SALE',-v_requested_qty,v_inventory.quantity,v_inventory.quantity-v_requested_qty,'APP_ORDER',v_order_id,'Reserva de estoque no pedido do aplicativo',p_customer_id);end if;
 end loop;
 for v_item in select value from jsonb_array_elements(p_items) loop insert into public.order_items(order_id,product_id,product_name_snapshot,quantity,unit_price,total_price,notes) values(v_order_id,nullif(v_item->>'product_id','')::uuid,v_item->>'name',(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,(v_item->>'total_price')::numeric,v_item->>'notes') returning id into v_order_item_id;if jsonb_typeof(v_item->'options')='array' then for v_option in select value from jsonb_array_elements(v_item->'options') loop insert into public.order_item_options(order_item_id,option_name_snapshot,price,quantity) values(v_order_item_id,v_option->>'name',coalesce((v_option->>'price')::numeric,0),coalesce((v_option->>'quantity')::numeric,1));end loop;end if;end loop;
 insert into public.order_status_history(order_id,status,changed_by) values(v_order_id,p_status,p_customer_id);insert into public.payments(order_id,provider,method,amount,status) values(v_order_id,p_payment_provider,p_payment_method,p_total,p_payment_status);if p_coupon_id is not null then insert into public.coupon_redemptions(coupon_id,order_id,customer_id,discount_amount) values(p_coupon_id,v_order_id,p_customer_id,p_discount);end if;return v_order_id;
end;$$;

create or replace function private.restore_app_order_inventory() returns trigger language plpgsql security definer set search_path=''
as $$
declare v_movement public.inventory_movements%rowtype;v_inventory public.inventory_items%rowtype;
begin
 if new.source<>'APP' or new.status not in ('CANCELLED','REJECTED','PAYMENT_FAILED') or old.status=new.status then return new;end if;
 for v_movement in select * from public.inventory_movements m where m.reference_type='APP_ORDER' and m.reference_id=new.id and m.movement_type='SALE' order by m.created_at,m.id loop
  if exists(select 1 from public.inventory_movements x where x.reference_type='APP_ORDER' and x.reference_id=new.id and x.product_id=v_movement.product_id and x.movement_type='CANCELLATION') then continue;end if;
  select * into v_inventory from public.inventory_items where store_id=new.store_id and product_id=v_movement.product_id for update;if not found then continue;end if;
  update public.inventory_items set quantity=v_inventory.quantity+abs(v_movement.quantity),updated_at=now() where id=v_inventory.id;
  insert into public.inventory_movements(store_id,product_id,movement_type,quantity,previous_quantity,new_quantity,reference_type,reference_id,reason,created_by) values(new.store_id,v_movement.product_id,'CANCELLATION',abs(v_movement.quantity),v_inventory.quantity,v_inventory.quantity+abs(v_movement.quantity),'APP_ORDER',new.id,'Estoque devolvido por encerramento do pedido',new.customer_id);
 end loop;return new;
end;$$;
revoke all on function private.restore_app_order_inventory() from public,anon,authenticated;
drop trigger if exists orders_restore_app_inventory on public.orders;
create trigger orders_restore_app_inventory after update of status on public.orders for each row execute function private.restore_app_order_inventory();
create index if not exists idx_inventory_movements_app_order_restore on public.inventory_movements(reference_type,reference_id,product_id,movement_type) where reference_type='APP_ORDER';
