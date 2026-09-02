-- Mantém o checkout atômico executável somente pelo backend e garante acesso
-- às rotinas privadas usadas internamente pela transação.
alter function public.checkout_order_atomic(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,text,jsonb
) security definer;

revoke all on function public.checkout_order_atomic(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,text,jsonb
) from public, anon, authenticated;

grant execute on function public.checkout_order_atomic(
  uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,
  numeric,numeric,numeric,numeric,text,jsonb
) to service_role;

-- Token interno usado apenas pelo pg_cron para chamar o worker de reconciliação.
create table if not exists public.card_reconcile_worker_tokens (
  singleton boolean primary key default true check (singleton),
  token text not null,
  updated_at timestamptz not null default now()
);

revoke all on table public.card_reconcile_worker_tokens from public, anon, authenticated;
grant select on table public.card_reconcile_worker_tokens to service_role;

insert into public.card_reconcile_worker_tokens(singleton, token)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (singleton) do nothing;

-- Evita cron duplicado quando a migration é reaplicada em um ambiente de teste.
do $$
declare
  v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname = 'clickfood-efi-card-reconcile-worker'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end
$$;

select cron.schedule(
  'clickfood-efi-card-reconcile-worker',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/efi-card-reconcile-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clickfood-card-worker-token', (
        select token
        from public.card_reconcile_worker_tokens
        where singleton = true
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);
