create or replace function private.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_product_name text;
begin
  if old.quantity > old.minimum_quantity and new.quantity <= new.minimum_quantity then
    select name into v_product_name from public.products where id=new.product_id;
    insert into public.notifications(user_id,notification_type,title,body,data)
    select sm.user_id,
           'STORE_LOW_STOCK',
           'Estoque baixo',
           coalesce(v_product_name,'Produto') || ' atingiu o estoque mínimo. Saldo atual: ' || trim(to_char(new.quantity,'FM999999990.###')) || '.',
           jsonb_build_object('storeId',new.store_id,'productId',new.product_id,'quantity',new.quantity,'minimumQuantity',new.minimum_quantity)
      from public.store_memberships sm
     where sm.store_id=new.store_id
       and sm.active=true
       and sm.role in ('OWNER','MANAGER');
  end if;
  return new;
end;
$$;

revoke all on function private.notify_low_stock() from public, anon, authenticated;

drop trigger if exists trg_inventory_low_stock_notification on public.inventory_items;
create trigger trg_inventory_low_stock_notification
after update of quantity,minimum_quantity on public.inventory_items
for each row execute function private.notify_low_stock();
