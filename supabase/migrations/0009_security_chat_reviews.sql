-- CLICK-FOOD: hardening de chat, notificações e avaliações.

-- Chat deve passar obrigatoriamente pela Edge Function de moderação.
revoke insert on public.messages from authenticated;
drop policy if exists messages_participant_insert on public.messages;

-- Usuário só pode alterar read_at nas próprias notificações.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- A avaliação de entregador precisa apontar para o entregador real daquele pedido.
drop policy if exists reviews_customer_insert on public.reviews;
create policy reviews_customer_insert on public.reviews
for insert to authenticated
with check (
  (select auth.uid()) = customer_id
  and exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.customer_id = (select auth.uid())
      and o.store_id = store_id
      and o.status = 'DELIVERED'
  )
  and (
    driver_id is null
    or exists (
      select 1 from public.deliveries d
      where d.order_id = order_id
        and d.driver_id = reviews.driver_id
        and d.status = 'DELIVERED'
    )
  )
);
