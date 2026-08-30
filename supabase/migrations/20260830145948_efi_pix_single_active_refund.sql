create unique index if not exists refunds_one_active_per_payment_uidx
on public.refunds(payment_id)
where status in ('PENDING','PROCESSING');
