create unique index if not exists refunds_provider_refund_id_uidx
  on public.refunds(provider_refund_id)
  where provider_refund_id is not null;

create index if not exists refunds_payment_status_idx
  on public.refunds(payment_id, status, created_at desc);
