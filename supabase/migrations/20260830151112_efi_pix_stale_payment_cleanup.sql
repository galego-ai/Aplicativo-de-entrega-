create or replace function private.expire_stale_efi_pix_orders()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select c.id as charge_id,c.payment_id,c.order_id,o.status as order_status
    from public.efi_pix_charges c
    join public.payments p on p.id=c.payment_id
    join public.orders o on o.id=c.order_id
    where c.status='ACTIVE'
      and c.expires_at < now()-interval '1 hour'
      and p.status in ('PENDING','PROCESSING')
      and o.status='PENDING_PAYMENT'
    order by c.expires_at
    for update of c,p,o skip locked
  loop
    update public.efi_pix_charges set status='EXPIRED',updated_at=now() where id=v_row.charge_id and status='ACTIVE';
    update public.payments set status='FAILED' where id=v_row.payment_id and status in ('PENDING','PROCESSING');
    perform public.transition_order_atomic(v_row.order_id,'PENDING_PAYMENT','PAYMENT_FAILED',null,'PIX Efí expirado sem confirmação após período de segurança');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_stale_efi_pix_orders() from public, anon, authenticated;

DO $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='clickfood-efi-pix-stale-cleanup';
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('clickfood-efi-pix-stale-cleanup','*/10 * * * *','select private.expire_stale_efi_pix_orders();');
end $$;
