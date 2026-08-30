-- CLICK-FOOD: invariantes contábeis do pedido.
-- Impede desconto acima do valor bruto e totais incompatíveis com subtotal/taxa/desconto.

alter table public.orders
  drop constraint if exists orders_discount_within_gross_check,
  drop constraint if exists orders_total_accounting_check;

alter table public.orders
  add constraint orders_discount_within_gross_check
    check (discount <= subtotal + delivery_fee + 0.009),
  add constraint orders_total_accounting_check
    check (abs((subtotal + delivery_fee - discount) - total) <= 0.009);
