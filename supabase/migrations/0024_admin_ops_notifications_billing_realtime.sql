create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  audience text not null check (audience in ('CUSTOMERS','DRIVERS','STORE_USERS','STORE','USER')),
  store_id uuid null references public.stores(id) on delete set null,
  user_id uuid null references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  status text not null default 'SENT' check (status in ('SENT','FAILED')),
  created_at timestamptz not null default now()
);
alter table public.notification_broadcasts enable row level security;
grant select on public.notification_broadcasts to authenticated;
create policy "notification_broadcasts_admin_read" on public.notification_broadcasts for select to authenticated using (private.is_admin());

create table if not exists public.billing_policy (
  id smallint primary key default 1 check (id = 1),
  grace_days integer not null default 3 check (grace_days >= 0 and grace_days <= 90),
  suspend_after_days integer not null default 7 check (suspend_after_days >= 1 and suspend_after_days <= 180),
  auto_suspend boolean not null default false,
  updated_by uuid null references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.billing_policy(id) values (1) on conflict (id) do nothing;
alter table public.billing_policy enable row level security;
grant select on public.billing_policy to authenticated;
create policy "billing_policy_admin_read" on public.billing_policy for select to authenticated using (private.is_admin());

create table if not exists public.store_billing_locks (
  store_id uuid primary key references public.stores(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  previous_store_status text not null,
  locked_at timestamptz not null default now()
);
alter table public.store_billing_locks enable row level security;
grant select on public.store_billing_locks to authenticated;
create policy "store_billing_locks_admin_read" on public.store_billing_locks for select to authenticated using (private.is_admin());

create index if not exists idx_notification_broadcasts_created_at on public.notification_broadcasts(created_at desc);
create index if not exists idx_invoices_status_due_date on public.invoices(status,due_date);
create index if not exists idx_subscriptions_status on public.subscriptions(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='driver_locations') THEN EXECUTE 'alter publication supabase_realtime add table public.driver_locations'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='drivers') THEN EXECUTE 'alter publication supabase_realtime add table public.drivers'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='orders') THEN EXECUTE 'alter publication supabase_realtime add table public.orders'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='deliveries') THEN EXECUTE 'alter publication supabase_realtime add table public.deliveries'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN EXECUTE 'alter publication supabase_realtime add table public.notifications'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='invoices') THEN EXECUTE 'alter publication supabase_realtime add table public.invoices'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='subscriptions') THEN EXECUTE 'alter publication supabase_realtime add table public.subscriptions'; END IF;
END $$;
