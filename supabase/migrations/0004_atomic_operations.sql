-- CLICK-FOOD: operações transacionais críticas.
-- SECURITY INVOKER: as funções executam com o papel chamador.
-- Somente service_role recebe EXECUTE; clientes nunca chamam estas funções diretamente.

create or replace function public.create_order_atomic(
  p_store_id uuid,
  p_customer_id uuid,
  p_address_id uuid,
  p_source text,
  p_delivery_type text,
  p_status text,
  p_payment_status text,
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
    store_id,
    customer_id,
    address_id,
    source,
    delivery_type,
    status,
    payment_status,
    subtotal,
    delivery_fee,
    discount,
    total,
    customer_notes
  ) values (
    p_store_id,
    p_customer_id,
    p_address_id,
    p_source,
    p_delivery_type,
    p_status,
    p_payment_status,
    p_subtotal,
    p_delivery_fee,
    p_discount,
    p_total,
    p_customer_notes
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      quantity,
      unit_price,
      total_price,
      notes
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
          order_item_id,
          option_name_snapshot,
          price,
          quantity
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

  return v_order_id;
end;
$$;

revoke all on function public.create_order_atomic(uuid,uuid,uuid,text,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_atomic(uuid,uuid,uuid,text,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) to service_role;

create or replace function public.accept_delivery_offer_atomic(
  p_offer_id uuid,
  p_driver_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offer public.delivery_offers%rowtype;
  v_delivery public.deliveries%rowtype;
begin
  select * into v_offer
  from public.delivery_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if v_offer.driver_id <> p_driver_id then
    raise exception 'OFFER_DRIVER_MISMATCH';
  end if;

  if v_offer.status <> 'PENDING' then
    raise exception 'OFFER_NOT_PENDING';
  end if;

  if v_offer.expires_at <= now() then
    update public.delivery_offers
    set status = 'EXPIRED', responded_at = now()
    where id = p_offer_id;
    raise exception 'OFFER_EXPIRED';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = v_offer.delivery_id
  for update;

  if not found then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;

  if v_delivery.driver_id is not null or v_delivery.status not in ('SEARCHING_DRIVER','OFFER_SENT') then
    raise exception 'DELIVERY_ALREADY_ASSIGNED';
  end if;

  update public.deliveries
  set driver_id = p_driver_id,
      status = 'DRIVER_ASSIGNED',
      updated_at = now()
  where id = v_delivery.id;

  update public.delivery_offers
  set status = case when id = p_offer_id then 'ACCEPTED' else 'EXPIRED' end,
      responded_at = case when id = p_offer_id then now() else responded_at end
  where delivery_id = v_delivery.id
    and status = 'PENDING';

  return v_delivery.id;
end;
$$;

revoke all on function public.accept_delivery_offer_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.accept_delivery_offer_atomic(uuid,uuid) to service_role;

-- Finalização financeira do pedido, também transacional.
create or replace function public.post_order_financials_atomic(
  p_order_id uuid,
  p_store_id uuid,
  p_driver_id uuid,
  p_gross numeric,
  p_platform_commission numeric,
  p_delivery_fee numeric,
  p_driver_earning numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_gross < 0 or p_platform_commission < 0 or p_delivery_fee < 0 or p_driver_earning < 0 then
    raise exception 'INVALID_FINANCIAL_AMOUNT';
  end if;

  if exists (
    select 1 from public.financial_transactions
    where order_id = p_order_id and transaction_type = 'ORDER_SALE' and status = 'POSTED'
  ) then
    raise exception 'ORDER_FINANCIALS_ALREADY_POSTED';
  end if;

  insert into public.financial_transactions (store_id, order_id, transaction_type, direction, amount)
  values (p_store_id, p_order_id, 'ORDER_SALE', 'CREDIT', p_gross);

  if p_platform_commission > 0 then
    insert into public.financial_transactions (store_id, order_id, transaction_type, direction, amount)
    values (p_store_id, p_order_id, 'PLATFORM_COMMISSION', 'DEBIT', p_platform_commission);
  end if;

  if p_delivery_fee > 0 then
    insert into public.financial_transactions (store_id, order_id, transaction_type, direction, amount)
    values (p_store_id, p_order_id, 'DELIVERY_FEE', 'CREDIT', p_delivery_fee);
  end if;

  if p_driver_id is not null and p_driver_earning > 0 then
    insert into public.financial_transactions (store_id, order_id, driver_id, transaction_type, direction, amount)
    values (p_store_id, p_order_id, p_driver_id, 'DRIVER_EARNING', 'DEBIT', p_driver_earning);
  end if;
end;
$$;

revoke all on function public.post_order_financials_atomic(uuid,uuid,uuid,numeric,numeric,numeric,numeric) from public, anon, authenticated;
grant execute on function public.post_order_financials_atomic(uuid,uuid,uuid,numeric,numeric,numeric,numeric) to service_role;
