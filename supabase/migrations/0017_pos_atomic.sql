-- CLICK-FOOD: venda de balcão transacional com caixa, pagamentos e estoque.

create or replace function public.create_pos_sale_atomic(
  p_store_id uuid,
  p_actor_id uuid,
  p_cash_session_id uuid,
  p_subtotal numeric,
  p_discount numeric,
  p_total numeric,
  p_items jsonb,
  p_payments jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_item_id uuid;
  v_item jsonb;
  v_option jsonb;
  v_payment jsonb;
  v_product public.products%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_session public.cash_sessions%rowtype;
  v_register public.cash_registers%rowtype;
  v_payment_sum numeric := 0;
  v_qty numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'PAYMENT_REQUIRED';
  end if;
  if p_total < 0 or p_subtotal < 0 or p_discount < 0 then raise exception 'INVALID_TOTAL'; end if;

  select * into v_session from public.cash_sessions where id = p_cash_session_id for update;
  if not found or v_session.status <> 'OPEN' then raise exception 'CASH_SESSION_NOT_OPEN'; end if;
  select * into v_register from public.cash_registers where id = v_session.cash_register_id;
  if not found or v_register.store_id <> p_store_id then raise exception 'CASH_REGISTER_STORE_MISMATCH'; end if;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if coalesce((v_payment ->> 'amount')::numeric, 0) < 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
    v_payment_sum := v_payment_sum + coalesce((v_payment ->> 'amount')::numeric, 0);
  end loop;
  if abs(v_payment_sum - p_total) > 0.009 then raise exception 'PAYMENT_TOTAL_MISMATCH'; end if;

  insert into public.orders (
    store_id, customer_id, address_id, source, delivery_type, status, payment_status,
    subtotal, delivery_fee, discount, total, delivered_at
  ) values (
    p_store_id, null, null, 'POS', 'COUNTER', 'DELIVERED', 'PAID',
    p_subtotal, 0, p_discount, p_total, now()
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products
      where id = nullif(v_item ->> 'product_id','')::uuid and store_id = p_store_id for update;
    if not found or not v_product.active or not v_product.available_pos then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty <= 0 then raise exception 'INVALID_QUANTITY'; end if;

    if v_product.control_inventory then
      select * into v_inventory from public.inventory_items
        where store_id = p_store_id and product_id = v_product.id for update;
      if not found then raise exception 'INVENTORY_NOT_CONFIGURED'; end if;
      if v_inventory.quantity < v_qty then raise exception 'INSUFFICIENT_STOCK'; end if;
      update public.inventory_items
        set quantity = v_inventory.quantity - v_qty, updated_at = now()
        where id = v_inventory.id;
      insert into public.inventory_movements (
        store_id, product_id, movement_type, quantity, previous_quantity, new_quantity,
        reference_type, reference_id, reason, created_by
      ) values (
        p_store_id, v_product.id, 'SALE', -v_qty, v_inventory.quantity,
        v_inventory.quantity - v_qty, 'POS_ORDER', v_order_id, 'Venda PDV', p_actor_id
      );
    end if;

    insert into public.order_items (
      order_id, product_id, product_name_snapshot, quantity, unit_price, total_price, notes
    ) values (
      v_order_id, v_product.id, v_item ->> 'name', v_qty,
      (v_item ->> 'unit_price')::numeric, (v_item ->> 'total_price')::numeric,
      v_item ->> 'notes'
    ) returning id into v_order_item_id;

    if jsonb_typeof(v_item -> 'options') = 'array' then
      for v_option in select value from jsonb_array_elements(v_item -> 'options') loop
        insert into public.order_item_options (order_item_id, option_name_snapshot, price, quantity)
        values (
          v_order_item_id, v_option ->> 'name',
          coalesce((v_option ->> 'price')::numeric,0),
          coalesce((v_option ->> 'quantity')::numeric,1)
        );
      end loop;
    end if;
  end loop;

  insert into public.order_status_history (order_id, status, changed_by, reason)
  values (v_order_id, 'DELIVERED', p_actor_id, 'Venda concluída no PDV');

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    insert into public.payments (order_id, provider, method, amount, status, paid_at)
    values (
      v_order_id, 'POS', v_payment ->> 'method',
      (v_payment ->> 'amount')::numeric, 'PAID', now()
    );
    insert into public.cash_transactions (
      cash_session_id, transaction_type, amount, payment_method, reference_id, reason, created_by
    ) values (
      p_cash_session_id, 'SALE', (v_payment ->> 'amount')::numeric,
      v_payment ->> 'method', v_order_id, 'Venda PDV', p_actor_id
    );
  end loop;

  insert into public.financial_transactions (
    store_id, order_id, transaction_type, direction, amount, status
  ) values (p_store_id, v_order_id, 'ORDER_SALE', 'CREDIT', p_total, 'POSTED');

  return v_order_id;
end;
$$;

revoke all on function public.create_pos_sale_atomic(uuid,uuid,uuid,numeric,numeric,numeric,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_pos_sale_atomic(uuid,uuid,uuid,numeric,numeric,numeric,jsonb,jsonb) to service_role;
