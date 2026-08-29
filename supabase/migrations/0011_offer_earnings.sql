-- O ganho pode variar conforme a distância do entregador até a loja.
alter table public.delivery_offers
  add column offered_earning numeric(12,2) not null default 0 check (offered_earning >= 0);

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

  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if v_offer.driver_id <> p_driver_id then raise exception 'OFFER_DRIVER_MISMATCH'; end if;
  if v_offer.status <> 'PENDING' then raise exception 'OFFER_NOT_PENDING'; end if;

  if v_offer.expires_at <= now() then
    update public.delivery_offers set status = 'EXPIRED', responded_at = now() where id = p_offer_id;
    raise exception 'OFFER_EXPIRED';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = v_offer.delivery_id
  for update;

  if not found then raise exception 'DELIVERY_NOT_FOUND'; end if;
  if v_delivery.driver_id is not null or v_delivery.status not in ('SEARCHING_DRIVER','OFFER_SENT') then
    raise exception 'DELIVERY_ALREADY_ASSIGNED';
  end if;

  update public.deliveries
  set driver_id = p_driver_id,
      driver_earning = v_offer.offered_earning,
      status = 'DRIVER_ASSIGNED',
      updated_at = now()
  where id = v_delivery.id;

  update public.delivery_offers
  set status = case when id = p_offer_id then 'ACCEPTED' else 'EXPIRED' end,
      responded_at = case when id = p_offer_id then now() else responded_at end
  where delivery_id = v_delivery.id and status = 'PENDING';

  return v_delivery.id;
end;
$$;

revoke all on function public.accept_delivery_offer_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.accept_delivery_offer_atomic(uuid,uuid) to service_role;
