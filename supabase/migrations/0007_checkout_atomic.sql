-- CLICK-FOOD: checkout completo em uma transação.

create or replace function public.checkout_order_atomic(
  p_store_id uuid,
  p_customer_id uuid,
  p_address_id uuid,
  p_delivery_quote_id uuid,
  p_coupon_id uuid,
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
  v_quote_updated integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  if p_delivery_type = 'DELIVERY' then
    if p_delivery_quote_id is null or p_address_id is null then
      raise exception 'DELIVERY_QUOTE_REQUIRED';
    end if;

    update public.delivery_quotes
    set consumed_at = now()
    where id = p_delivery_quote_id
      and store_id = p_store_id
      and customer_id = p_customer_id
      and address_id = p_address_id
      and consumed_at is null
      and expires_at > now()
      and fee = p_delivery_fee;

    get diagnostics v_quote_updated = row_count;
    if v_quote_updated <> 1 then
      raise exception 'DELIVERY_QUOTE_INVALID_OR_CONSUMED';
    end if;
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

  if p_coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, discount_amount)
    values (p_coupon_id, v_order_id, p_customer_id, p_discount);
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.checkout_order_atomic(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) from public, anon, authenticated;
grant execute on function public.checkout_order_atomic(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) to service_role;
