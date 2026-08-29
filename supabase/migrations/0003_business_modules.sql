-- CLICK-FOOD: módulos comerciais e operacionais complementares.

-- -----------------------------------------------------------------------------
-- Planos, assinaturas e faturamento B2B
-- -----------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  setup_fee numeric(12,2) not null default 0 check (setup_fee >= 0),
  monthly_fee numeric(12,2) not null default 0 check (monthly_fee >= 0),
  commission_percentage numeric(5,2) not null default 0 check (commission_percentage between 0 and 100),
  included_orders integer check (included_orders is null or included_orders >= 0),
  extra_order_fee numeric(12,2) not null default 0 check (extra_order_fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value numeric,
  config jsonb not null default '{}'::jsonb,
  primary key (plan_id, feature_key)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED')),
  started_at timestamptz not null default now(),
  renewal_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete restrict,
  reference_month date not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  status text not null default 'OPEN' check (status in ('OPEN','PAID','PAST_DUE','CANCELLED','WAIVED')),
  paid_at timestamptz,
  external_reference text,
  created_at timestamptz not null default now(),
  unique (store_id, reference_month)
);

-- -----------------------------------------------------------------------------
-- PDV e caixa
-- -----------------------------------------------------------------------------
create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opening_balance numeric(12,2) not null default 0 check (opening_balance >= 0),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete restrict,
  closing_balance numeric(12,2),
  expected_balance numeric(12,2),
  difference numeric(12,2),
  closed_at timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  notes text
);

create unique index one_open_session_per_register
on public.cash_sessions(cash_register_id)
where status = 'OPEN';

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('SALE','SUPPLY','WITHDRAWAL','EXPENSE','REFUND','ADJUSTMENT')),
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text check (payment_method in ('PIX','CREDIT_CARD','DEBIT_CARD','CASH','WALLET','OTHER')),
  reference_id uuid,
  reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Cupons e promoções
-- -----------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('PERCENTAGE','FIXED','FREE_DELIVERY')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  max_uses integer check (max_uses is null or max_uses >= 1),
  max_uses_per_customer integer check (max_uses_per_customer is null or max_uses_per_customer >= 1),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, code)
);

create table public.coupon_rules (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  rule_type text not null check (rule_type in ('FIRST_ORDER','PRODUCT','CATEGORY','CUSTOMER','WEEKDAY','TIME_WINDOW')),
  rule_value jsonb not null
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid references auth.users(id) on delete set null,
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Fidelidade do cliente
-- -----------------------------------------------------------------------------
create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  points_per_currency numeric(12,4) not null default 1 check (points_per_currency >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.loyalty_programs(id) on delete cascade,
  name text not null,
  points_cost integer not null check (points_cost > 0),
  reward_type text not null check (reward_type in ('DISCOUNT_FIXED','DISCOUNT_PERCENTAGE','PRODUCT','FREE_DELIVERY')),
  reward_value numeric(12,2),
  product_id uuid references public.products(id) on delete set null,
  active boolean not null default true
);

create table public.customer_loyalty_wallets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  unique (customer_id, store_id)
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.customer_loyalty_wallets(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('EARN','REDEEM','ADJUSTMENT','EXPIRE','REVERSAL')),
  points integer not null,
  order_id uuid references public.orders(id) on delete restrict,
  reward_id uuid references public.loyalty_rewards(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- CLICK Pontos do lojista
-- -----------------------------------------------------------------------------
create table public.bonus_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  metric text not null check (metric in ('COMPLETED_ORDERS','GMV','NEW_CUSTOMERS','RATING','CUSTOM')),
  target numeric(14,2) not null check (target >= 0),
  period text not null check (period in ('DAILY','WEEKLY','MONTHLY','CAMPAIGN')),
  points_awarded integer not null check (points_awarded > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.store_bonus_wallets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.store_bonus_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.store_bonus_wallets(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('EARN','REDEEM','ADJUSTMENT','REVERSAL')),
  points integer not null,
  bonus_rule_id uuid references public.bonus_rules(id) on delete set null,
  description text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.bonus_rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  points_cost integer not null check (points_cost > 0),
  reward_type text not null check (reward_type in ('CREDIT','FREE_MONTH','APP_HIGHLIGHT','CAMPAIGN','CUSTOM')),
  reward_value numeric(12,2),
  requires_approval boolean not null default false,
  active boolean not null default true,
  inventory_limit integer check (inventory_limit is null or inventory_limit >= 0),
  created_at timestamptz not null default now()
);

create table public.bonus_redemptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  reward_id uuid not null references public.bonus_rewards(id) on delete restrict,
  points_spent integer not null check (points_spent > 0),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','FULFILLED','CANCELLED')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Chat interno
-- -----------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  conversation_type text not null check (conversation_type in ('CUSTOMER_STORE','CUSTOMER_DRIVER','STORE_DRIVER','SUPPORT')),
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED','ARCHIVED')),
  created_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  message_type text not null default 'TEXT' check (message_type in ('TEXT','IMAGE','SYSTEM')),
  content text,
  attachment_url text,
  moderation_status text not null default 'ALLOWED' check (moderation_status in ('ALLOWED','BLOCKED','REVIEW')),
  created_at timestamptz not null default now()
);

create or replace function private.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = target_conversation_id
      and cp.user_id = auth.uid()
  );
$$;

revoke all on function private.is_conversation_participant(uuid) from public;
grant execute on function private.is_conversation_participant(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Suporte e notificações
-- -----------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references auth.users(id) on delete restrict,
  store_id uuid references public.stores(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  delivery_id uuid references public.deliveries(id) on delete set null,
  category text not null,
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED')),
  subject text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  attachment_url text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Gateways/Webhooks e idempotência
-- -----------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (provider, event_id)
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
create index idx_invoices_store_status on public.invoices(store_id, status, due_date);
create index idx_cash_sessions_register on public.cash_sessions(cash_register_id, opened_at desc);
create index idx_cash_transactions_session on public.cash_transactions(cash_session_id, created_at);
create index idx_coupon_code on public.coupons(code, active);
create index idx_loyalty_wallet_customer on public.customer_loyalty_wallets(customer_id, store_id);
create index idx_bonus_transactions_wallet on public.store_bonus_transactions(wallet_id, created_at desc);
create index idx_messages_conversation on public.messages(conversation_id, created_at);
create index idx_support_opened_by on public.support_tickets(opened_by, created_at desc);
create index idx_notifications_user on public.notifications(user_id, created_at desc);
create index idx_webhook_pending on public.webhook_events(processed, received_at) where processed = false;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_rules enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.customer_loyalty_wallets enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.bonus_rules enable row level security;
alter table public.store_bonus_wallets enable row level security;
alter table public.store_bonus_transactions enable row level security;
alter table public.bonus_rewards enable row level security;
alter table public.bonus_redemptions enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.webhook_events enable row level security;

revoke all on public.plans, public.plan_features, public.subscriptions, public.invoices,
  public.cash_registers, public.cash_sessions, public.cash_transactions,
  public.coupons, public.coupon_rules, public.coupon_redemptions,
  public.loyalty_programs, public.loyalty_rewards, public.customer_loyalty_wallets, public.loyalty_transactions,
  public.bonus_rules, public.store_bonus_wallets, public.store_bonus_transactions, public.bonus_rewards, public.bonus_redemptions,
  public.conversations, public.conversation_participants, public.messages,
  public.support_tickets, public.support_messages, public.notifications, public.webhook_events
from anon, authenticated;

-- Planos e recompensas podem ser exibidos publicamente.
grant select on public.plans, public.plan_features, public.bonus_rewards to anon, authenticated;
create policy plans_public_read on public.plans for select to anon, authenticated using (active = true or private.is_admin());
create policy plan_features_public_read on public.plan_features for select to anon, authenticated using (exists (select 1 from public.plans p where p.id = plan_id and p.active) or private.is_admin());
create policy bonus_rewards_public_read on public.bonus_rewards for select to anon, authenticated using (active = true or private.is_admin());

-- Assinaturas/faturas da loja.
grant select on public.subscriptions, public.invoices to authenticated;
create policy subscriptions_store_read on public.subscriptions for select to authenticated using (private.is_store_member(store_id) or private.is_admin());
create policy invoices_store_read on public.invoices for select to authenticated using (private.is_store_member(store_id) or private.is_admin());

-- PDV/caixa: leitura direta. Escritas financeiras críticas passam pelo backend.
grant select on public.cash_registers, public.cash_sessions, public.cash_transactions to authenticated;
create policy cash_registers_store_read on public.cash_registers for select to authenticated using (private.is_store_member(store_id) or private.is_admin());
create policy cash_sessions_store_read on public.cash_sessions for select to authenticated using (exists (select 1 from public.cash_registers cr where cr.id = cash_register_id and (private.is_store_member(cr.store_id) or private.is_admin())));
create policy cash_transactions_store_read on public.cash_transactions for select to authenticated using (exists (select 1 from public.cash_sessions cs join public.cash_registers cr on cr.id = cs.cash_register_id where cs.id = cash_session_id and (private.is_store_member(cr.store_id) or private.is_admin())));

-- Fidelidade: cliente vê apenas sua carteira; loja vê carteiras vinculadas à própria loja.
grant select on public.loyalty_programs, public.loyalty_rewards to anon, authenticated;
grant select on public.customer_loyalty_wallets, public.loyalty_transactions to authenticated;
create policy loyalty_programs_public_read on public.loyalty_programs for select to anon, authenticated using (active = true or private.is_store_member(store_id) or private.is_admin());
create policy loyalty_rewards_public_read on public.loyalty_rewards for select to anon, authenticated using (active = true or private.is_admin());
create policy loyalty_wallet_scope on public.customer_loyalty_wallets for select to authenticated using ((select auth.uid()) = customer_id or private.is_store_member(store_id) or private.is_admin());
create policy loyalty_tx_scope on public.loyalty_transactions for select to authenticated using (exists (select 1 from public.customer_loyalty_wallets w where w.id = wallet_id and ((select auth.uid()) = w.customer_id or private.is_store_member(w.store_id) or private.is_admin())));

-- CLICK Pontos: apenas loja e matriz.
grant select on public.bonus_rules, public.store_bonus_wallets, public.store_bonus_transactions, public.bonus_redemptions to authenticated;
create policy bonus_rules_admin_or_store_read on public.bonus_rules for select to authenticated using (active = true or private.is_admin());
create policy store_bonus_wallet_scope on public.store_bonus_wallets for select to authenticated using (private.is_store_member(store_id) or private.is_admin());
create policy store_bonus_tx_scope on public.store_bonus_transactions for select to authenticated using (exists (select 1 from public.store_bonus_wallets w where w.id = wallet_id and (private.is_store_member(w.store_id) or private.is_admin())));
create policy bonus_redemptions_scope on public.bonus_redemptions for select to authenticated using (private.is_store_member(store_id) or private.is_admin());

-- Chat: participante pode ler; inserção de mensagens somente em conversa da qual participa.
grant select on public.conversations, public.conversation_participants, public.messages to authenticated;
grant insert on public.messages to authenticated;
create policy conversations_participant_read on public.conversations for select to authenticated using (private.is_conversation_participant(id) or private.is_admin());
create policy conversation_participants_read on public.conversation_participants for select to authenticated using (private.is_conversation_participant(conversation_id) or private.is_admin());
create policy messages_participant_read on public.messages for select to authenticated using (private.is_conversation_participant(conversation_id) or private.is_admin());
create policy messages_participant_insert on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and private.is_conversation_participant(conversation_id));

-- Suporte.
grant select, insert on public.support_tickets, public.support_messages to authenticated;
create policy support_ticket_read on public.support_tickets for select to authenticated using (opened_by = (select auth.uid()) or (store_id is not null and private.is_store_member(store_id)) or private.is_admin());
create policy support_ticket_insert on public.support_tickets for insert to authenticated with check (opened_by = (select auth.uid()));
create policy support_message_read on public.support_messages for select to authenticated using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.opened_by = (select auth.uid()) or (t.store_id is not null and private.is_store_member(t.store_id)) or private.is_admin())));
create policy support_message_insert on public.support_messages for insert to authenticated with check (sender_id = (select auth.uid()) and exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.opened_by = (select auth.uid()) or (t.store_id is not null and private.is_store_member(t.store_id)) or private.is_admin())));

-- Notificações pessoais.
grant select, update on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy notifications_own_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Webhooks nunca são acessíveis por cliente/loja. Service role/backend apenas.
