-- O PostgREST não expõe o schema private. As Edge Functions usam estes wrappers
-- no schema public, mas somente com a service_role. Apps autenticados não podem
-- executá-los diretamente.

create or replace function public.service_driver_available_balance(p_driver_id uuid)
returns numeric
language sql
security definer
set search_path = ''
as $$
  select private.driver_available_balance(p_driver_id);
$$;

create or replace function public.service_request_store_payout_atomic(p_store_id uuid, p_user_id uuid, p_amount numeric, p_method text, p_destination_value text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.request_store_payout_atomic(p_store_id,p_user_id,p_amount,p_method,p_destination_value);
$$;

create or replace function public.service_request_driver_payout_atomic(p_driver_id uuid, p_user_id uuid, p_amount numeric, p_method text, p_destination_value text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.request_driver_payout_atomic(p_driver_id,p_user_id,p_amount,p_method,p_destination_value);
$$;

create or replace function public.service_review_store_payout_atomic(p_payout_id uuid, p_target_status text, p_actor_id uuid, p_notes text default null, p_provider_id text default null)
returns public.payouts
language sql
security definer
set search_path = ''
as $$
  select private.review_store_payout_atomic(p_payout_id,p_target_status,p_actor_id,p_notes,p_provider_id);
$$;

create or replace function public.service_review_driver_payout_atomic(p_payout_id uuid, p_target_status text, p_actor_id uuid, p_notes text default null, p_provider_id text default null)
returns public.payouts
language sql
security definer
set search_path = ''
as $$
  select private.review_driver_payout_atomic(p_payout_id,p_target_status,p_actor_id,p_notes,p_provider_id);
$$;

create or replace function public.service_next_automatic_efi_payout()
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.next_automatic_efi_payout();
$$;

create or replace function public.service_prepare_efi_payout_send_atomic(p_payout_id uuid, p_actor_id uuid)
returns table(payout_id uuid, id_envio text, reused boolean)
language sql
security definer
set search_path = ''
as $$
  select * from private.prepare_efi_payout_send_atomic(p_payout_id,p_actor_id);
$$;

create or replace function public.service_sync_efi_payout_attempt_atomic(p_id_envio text, p_status text, p_e2e_id text, p_payload jsonb, p_error text)
returns public.payouts
language sql
security definer
set search_path = ''
as $$
  select private.sync_efi_payout_attempt_atomic(p_id_envio,p_status,p_e2e_id,p_payload,p_error);
$$;

revoke all on function public.service_driver_available_balance(uuid) from public, anon, authenticated;
revoke all on function public.service_request_store_payout_atomic(uuid,uuid,numeric,text,text) from public, anon, authenticated;
revoke all on function public.service_request_driver_payout_atomic(uuid,uuid,numeric,text,text) from public, anon, authenticated;
revoke all on function public.service_review_store_payout_atomic(uuid,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.service_review_driver_payout_atomic(uuid,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.service_next_automatic_efi_payout() from public, anon, authenticated;
revoke all on function public.service_prepare_efi_payout_send_atomic(uuid,uuid) from public, anon, authenticated;
revoke all on function public.service_sync_efi_payout_attempt_atomic(text,text,text,jsonb,text) from public, anon, authenticated;

grant execute on function public.service_driver_available_balance(uuid) to service_role;
grant execute on function public.service_request_store_payout_atomic(uuid,uuid,numeric,text,text) to service_role;
grant execute on function public.service_request_driver_payout_atomic(uuid,uuid,numeric,text,text) to service_role;
grant execute on function public.service_review_store_payout_atomic(uuid,text,uuid,text,text) to service_role;
grant execute on function public.service_review_driver_payout_atomic(uuid,text,uuid,text,text) to service_role;
grant execute on function public.service_next_automatic_efi_payout() to service_role;
grant execute on function public.service_prepare_efi_payout_send_atomic(uuid,uuid) to service_role;
grant execute on function public.service_sync_efi_payout_attempt_atomic(text,text,text,jsonb,text) to service_role;
