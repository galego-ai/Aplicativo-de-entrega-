-- CLICK-FOOD: cria pedido, itens, histórico e pagamento em uma única transação.

create or replace function public.create_order_with_payment_atomic(
  p_store_id uuid,
  p_customer_id uuid,
  p_address_id uuid,
  p_source text,
  p_delivery_type text,
  p_status text,
  p_payment_status text,
  p_payment_method text,
  p_payment_provider text,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_customer_notes text,
  p_items jsonb
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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  insert into public.orders (
    store_id, customer_id, address_id, source, delivery_type,
    status, payment_status, subtotal, delivery_fee, discount, total, customer_notes
  ) values (
    p_store_id, p_customer_id, p_address_id, p_source, p_delivery_type,
    p_status, p_payment_status, p_subtotal, p_delivery_fee, p_discount, p_total, p_customer_notes
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, quantity, unit_price, total_price, notes
    ) values (
      v_order_id,
      nullif(v_item ->> 'product_id', '')::uuid,
      v_item ->> 'name',
      (v_item ->> 'quantity')::numeric,
      (v_item ->> 'unit_price')::numeric,
      (v_item ->> 'total_price')::numeric,
      v_item ->> 'notes'
    ) returning id into v_order_item_id;

    if jsonb_typeof(v_item -> 'options') = 'array' then
      for v_option in select value from jsonb_array_elements(v_item -> 'options')
      loop
        insert into public.order_item_options (
          order_item_id, option_name_snapshot, price, quantity
        ) values (
          v_order_item_id,
          v_option ->> 'name',
          coalesce((v_option ->> 'price')::numeric, 0),
          coalesce((v_option ->> 'quantity')::numeric, 1)
        );
      end loop;
    end if;
  end loop;

  insert into public.order_status_history (order_id, status, changed_by)
  values (v_order_id, p_status, p_customer_id);

  insert into public.payments (order_id, provider, method, amount, status)
  values (v_order_id, p_payment_provider, p_payment_method, p_total, p_payment_status);

  return v_order_id;
end;
$$;

revoke all on function public.create_order_with_payment_atomic(uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_payment_atomic(uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) to service_role;
