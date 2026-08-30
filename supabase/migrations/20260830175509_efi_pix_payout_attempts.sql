create table if not exists public.payout_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete restrict,
  provider text not null,
  id_envio text not null unique,
  status text not null default 'CREATED',
  end_to_end_id text,
  provider_payload jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payout_provider_attempts enable row level security;
revoke all on table public.payout_provider_attempts from anon, authenticated;
grant select, insert, update on table public.payout_provider_attempts to service_role;
create index if not exists payout_provider_attempts_payout_idx on public.payout_provider_attempts(payout_id,created_at desc);
create unique index if not exists payout_provider_one_inflight_attempt on public.payout_provider_attempts(payout_id) where status in ('CREATED','EM_PROCESSAMENTO','UNKNOWN');

create or replace function private.sync_efi_payout_attempt_atomic(
  p_id_envio text,
  p_status text,
  p_e2e_id text default null,
  p_payload jsonb default null,
  p_error text default null
)
returns public.payouts
language plpgsql
security definer
set search_path=''
as $$
declare v_attempt public.payout_provider_attempts%rowtype; v_payout public.payouts%rowtype; v_status text:=upper(coalesce(p_status,''));
begin
 select * into v_attempt from public.payout_provider_attempts where id_envio=p_id_envio for update;
 if not found then raise exception 'PAYOUT_ATTEMPT_NOT_FOUND'; end if;
 update public.payout_provider_attempts
    set status=case when v_status='' then status else v_status end,
        end_to_end_id=coalesce(nullif(p_e2e_id,''),end_to_end_id),
        provider_payload=coalesce(p_payload,provider_payload),
        last_error=nullif(p_error,''),
        updated_at=now()
  where id=v_attempt.id returning * into v_attempt;
 update public.payouts
    set provider_name='EFI',provider_id=p_id_envio,provider_status=v_attempt.status,
        provider_end_to_end_id=coalesce(v_attempt.end_to_end_id,provider_end_to_end_id),
        provider_payload=coalesce(p_payload,provider_payload),provider_last_error=nullif(p_error,''),
        provider_checked_at=now(),updated_at=now()
  where id=v_attempt.payout_id returning * into v_payout;
 if v_status in ('REALIZADO','NAO_REALIZADO','REJEITADO','FAILED') then
   select * into v_payout from private.settle_efi_payout_atomic(p_id_envio,v_status,v_attempt.end_to_end_id,p_payload,p_error);
 end if;
 return v_payout;
end;$$;
revoke all on function private.sync_efi_payout_attempt_atomic(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.sync_efi_payout_attempt_atomic(text,text,text,jsonb,text) to service_role;