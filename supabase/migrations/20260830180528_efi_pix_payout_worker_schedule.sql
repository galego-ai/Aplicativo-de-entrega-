create table if not exists public.payout_worker_tokens (
  singleton boolean primary key default true check (singleton),
  token text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
alter table public.payout_worker_tokens enable row level security;
revoke all on table public.payout_worker_tokens from anon, authenticated;
grant select on table public.payout_worker_tokens to service_role;
insert into public.payout_worker_tokens(singleton,token)
values(true,encode(gen_random_bytes(32),'hex'))
on conflict(singleton) do nothing;

select cron.unschedule(jobid) from cron.job where jobname='clickfood-efi-payout-worker';
select cron.schedule(
  'clickfood-efi-payout-worker',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://rmlbmacoqnynqdqmxecz.supabase.co/functions/v1/efi-payout-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-clickfood-worker-token',(select token from public.payout_worker_tokens where singleton=true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $job$
);