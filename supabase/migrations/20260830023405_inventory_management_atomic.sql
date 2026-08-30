create or replace function public.inventory_manage_atomic(
  p_store_id uuid,
  p_product_id uuid,
  p_actor_id uuid,
  p_action text,
  p_quantity numeric default null,
  p_minimum_quantity numeric default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product public.products%rowtype;
  v_item public.inventory_items%rowtype;
  v_previous numeric;
  v_new numeric;
  v_delta numeric;
  v_movement text;
begin
  if p_action not in ('ENABLE','DISABLE','PURCHASE','LOSS','ADJUSTMENT','SET_MINIMUM') then
    raise exception 'INVALID_INVENTORY_ACTION';
  end if;

  select * into v_product from public.products
   where id=p_product_id and store_id=p_store_id
   for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  if p_action='DISABLE' then
    update public.products set control_inventory=false, updated_at=now() where id=p_product_id;
    return jsonb_build_object('productId',p_product_id,'controlInventory',false);
  end if;

  if p_quantity is not null and p_quantity < 0 then raise exception 'INVALID_QUANTITY'; end if;
  if p_minimum_quantity is not null and p_minimum_quantity < 0 then raise exception 'INVALID_MINIMUM_QUANTITY'; end if;

  select * into v_item from public.inventory_items
   where store_id=p_store_id and product_id=p_product_id
   for update;

  if not found then
    insert into public.inventory_items(store_id,product_id,quantity,minimum_quantity)
    values(p_store_id,p_product_id,0,coalesce(p_minimum_quantity,0))
    returning * into v_item;
  end if;

  v_previous:=v_item.quantity;

  if p_action='ENABLE' then
    update public.products set control_inventory=true, updated_at=now() where id=p_product_id;
    v_new:=coalesce(p_quantity,v_previous);
    update public.inventory_items set quantity=v_new,minimum_quantity=coalesce(p_minimum_quantity,minimum_quantity),updated_at=now() where id=v_item.id returning * into v_item;
    if v_new<>v_previous then
      insert into public.inventory_movements(store_id,product_id,movement_type,quantity,previous_quantity,new_quantity,reference_type,reason,created_by)
      values(p_store_id,p_product_id,'ADJUSTMENT',v_new-v_previous,v_previous,v_new,'MANUAL_INVENTORY',coalesce(nullif(trim(p_reason),''),'Ativação do controle de estoque'),p_actor_id);
    end if;
    return jsonb_build_object('productId',p_product_id,'controlInventory',true,'quantity',v_item.quantity,'minimumQuantity',v_item.minimum_quantity);
  end if;

  if not v_product.control_inventory then raise exception 'INVENTORY_CONTROL_DISABLED'; end if;

  if p_action='SET_MINIMUM' then
    if p_minimum_quantity is null then raise exception 'MINIMUM_QUANTITY_REQUIRED'; end if;
    update public.inventory_items set minimum_quantity=p_minimum_quantity,updated_at=now() where id=v_item.id returning * into v_item;
    return jsonb_build_object('productId',p_product_id,'controlInventory',true,'quantity',v_item.quantity,'minimumQuantity',v_item.minimum_quantity);
  end if;

  if p_quantity is null then raise exception 'QUANTITY_REQUIRED'; end if;

  if p_action='PURCHASE' then
    v_delta:=p_quantity; v_new:=v_previous+v_delta; v_movement:='PURCHASE';
  elsif p_action='LOSS' then
    v_delta:=-p_quantity; v_new:=v_previous+v_delta; v_movement:='LOSS';
    if v_new<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  else
    v_new:=p_quantity; v_delta:=v_new-v_previous; v_movement:='ADJUSTMENT';
  end if;

  update public.inventory_items set quantity=v_new,minimum_quantity=coalesce(p_minimum_quantity,minimum_quantity),updated_at=now() where id=v_item.id returning * into v_item;
  if v_delta<>0 then
    insert into public.inventory_movements(store_id,product_id,movement_type,quantity,previous_quantity,new_quantity,reference_type,reason,created_by)
    values(p_store_id,p_product_id,v_movement,v_delta,v_previous,v_new,'MANUAL_INVENTORY',left(coalesce(nullif(trim(p_reason),''),'Ajuste manual de estoque'),500),p_actor_id);
  end if;

  return jsonb_build_object('productId',p_product_id,'controlInventory',true,'quantity',v_item.quantity,'minimumQuantity',v_item.minimum_quantity);
end;
$$;

revoke all on function public.inventory_manage_atomic(uuid,uuid,uuid,text,numeric,numeric,text) from public, anon, authenticated;
grant execute on function public.inventory_manage_atomic(uuid,uuid,uuid,text,numeric,numeric,text) to service_role;
