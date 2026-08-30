create table if not exists public.payout_provider_configs (
  provider text primary key,
  display_name text not null,
  environment text not null default 'SANDBOX' check (environment in ('SANDBOX','PRODUCTION')),
  enabled boolean not null default false,
  credentials_configured boolean not null default false,
  automatic_processing boolean not null default false,
  validated_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.payout_provider_configs enable row level security;
revoke all on table public.payout_provider_configs from anon, authenticated;
grant select, insert, update on table public.payout_provider_configs to service_role;

insert into public.payout_provider_configs(provider,display_name,environment,enabled,credentials_configured,automatic_processing)
values(
  'EFI_PIX_SEND',
  'Efí Bank • Envio Pix',
  coalesce((select environment from public.payment_provider_configs where provider='EFI'),'SANDBOX'),
  false,false,false
)
on conflict(provider) do nothing;

alter table public.payouts
  add column if not exists provider_name text,
  add column if not exists provider_status text,
  add column if not exists provider_end_to_end_id text,
  add column if not exists provider_payload jsonb,
  add column if not exists provider_last_error text,
  add column if not exists provider_checked_at timestamptz;

create unique index if not exists payouts_provider_transfer_unique
  on public.payouts(provider_name,provider_id)
  where provider_name is not null and provider_id is not null;

create index if not exists payouts_provider_processing_idx
  on public.payouts(provider_name,status,requested_at)
  where provider_name is not null;

create or replace function private.settle_efi_payout_atomic(
  p_id_envio text,
  p_provider_status text,
  p_e2e_id text default null,
  p_payload jsonb default null,
  p_error text default null
)
returns public.payouts
language plpgsql
security definer
set search_path=''
as $$
declare
  v public.payouts%rowtype;
  v_target text;
  v_note text;
begin
  select * into v
    from public.payouts
   where provider_name='EFI' and provider_id=p_id_envio
   for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND'; end if;

  update public.payouts
     set provider_status=upper(coalesce(p_provider_status,'')),
         provider_end_to_end_id=coalesce(nullif(p_e2e_id,''),provider_end_to_end_id),
         provider_payload=coalesce(p_payload,provider_payload),
         provider_last_error=nullif(p_error,''),
         provider_checked_at=now(),
         updated_at=now()
   where id=v.id
   returning * into v;

  if upper(coalesce(p_provider_status,''))='REALIZADO' then
    if v.status='PAID' then return v; end if;
    if v.status<>'PROCESSING' then raise exception 'PAYOUT_NOT_PROCESSING'; end if;
    v_target:='PAID';
    v_note:='Efí confirmou o envio Pix';
  elsif upper(coalesce(p_provider_status,'')) in ('NAO_REALIZADO','REJEITADO','FAILED') then
    if v.status='FAILED' then return v; end if;
    if v.status<>'PROCESSING' then raise exception 'PAYOUT_NOT_PROCESSING'; end if;
    v_target:='FAILED';
    v_note:=coalesce(nullif(p_error,''),'Efí informou que o envio Pix não foi realizado');
  else
    return v;
  end if;

  if v.recipient_type='STORE' then
    select * into v from private.review_store_payout_atomic(v.id,v_target,null,v_note,p_id_envio);
  else
    select * into v from private.review_driver_payout_atomic(v.id,v_target,null,v_note,p_id_envio);
  end if;

  update public.payouts
     set provider_name='EFI',
         provider_status=upper(coalesce(p_provider_status,'')),
         provider_end_to_end_id=coalesce(nullif(p_e2e_id,''),provider_end_to_end_id),
         provider_payload=coalesce(p_payload,provider_payload),
         provider_last_error=nullif(p_error,''),
         provider_checked_at=now(),
         updated_at=now()
   where id=v.id
   returning * into v;

  return v;
end;
$$;

revoke all on function private.settle_efi_payout_atomic(text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function private.settle_efi_payout_atomic(text,text,text,jsonb,text) to service_role;