create or replace function private.expire_abandoned_efi_card_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select o.id as order_id, o.customer_id, p.id as payment_id
      from public.orders o
      join public.payments p on p.order_id = o.id
      left join public.efi_card_charges c on c.payment_id = p.id
     where o.source = 'APP'
       and o.status = 'PENDING_PAYMENT'
       and o.payment_status = 'PENDING'
       and p.method = 'CREDIT_CARD'
       and p.status = 'PENDING'
       and c.id is null
       and o.created_at < now() - interval '1 hour'
     for update of o, p skip locked
  loop
    update public.payments
       set status = 'FAILED'
     where id = v_row.payment_id
       and status = 'PENDING';

    if found then
      update public.orders
         set status = 'PAYMENT_FAILED',
             payment_status = 'FAILED',
             updated_at = now()
       where id = v_row.order_id
         and status = 'PENDING_PAYMENT'
         and payment_status = 'PENDING';

      if found then
        insert into public.order_status_history(order_id,status,changed_by,reason)
        values(v_row.order_id,'PAYMENT_FAILED',null,'Pagamento com cartão não iniciado no prazo de segurança');

        if v_row.customer_id is not null then
          insert into public.notifications(user_id,notification_type,title,body,data)
          values(
            v_row.customer_id,
            'PAYMENT_EXPIRED',
            'Pagamento expirado',
            'O pagamento com cartão não foi concluído e o pedido foi encerrado. Nenhuma cobrança foi realizada.',
            jsonb_build_object('orderId',v_row.order_id,'method','CREDIT_CARD')
          );
        end if;
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_abandoned_efi_card_orders() from public, anon, authenticated;
grant execute on function private.expire_abandoned_efi_card_orders() to service_role;

do $$
declare v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname='clickfood-efi-card-abandoned-cleanup';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule('clickfood-efi-card-abandoned-cleanup','*/10 * * * *','select private.expire_abandoned_efi_card_orders();');
end $$;