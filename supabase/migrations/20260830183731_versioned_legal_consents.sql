create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('TERMS','PRIVACY','DRIVER_TERMS','STORE_TERMS')),
  audience text not null check (audience in ('ALL','CUSTOMER','DRIVER','STORE')),
  version text not null,
  title text not null,
  content text not null,
  active boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_type,audience,version)
);

create table if not exists public.legal_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  app text not null check (app in ('CUSTOMER','DRIVER','STORE','ADMIN')),
  user_agent text,
  accepted_at timestamptz not null default now(),
  primary key(user_id,document_id)
);

create index if not exists legal_documents_active_audience_idx
  on public.legal_documents(active,audience,document_type);
create index if not exists legal_documents_created_by_idx
  on public.legal_documents(created_by);
create unique index if not exists legal_documents_one_active_idx
  on public.legal_documents(document_type,audience)
  where active;
create index if not exists legal_acceptances_document_idx
  on public.legal_acceptances(document_id);

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;

drop policy if exists legal_documents_public_active on public.legal_documents;
create policy legal_documents_public_active
  on public.legal_documents
  for select
  to anon,authenticated
  using (active or private.is_admin());

drop policy if exists legal_acceptances_self_read on public.legal_acceptances;
create policy legal_acceptances_self_read
  on public.legal_acceptances
  for select
  to authenticated
  using ((select auth.uid())=user_id or private.is_admin());

grant select on public.legal_documents to anon,authenticated;
grant select on public.legal_acceptances to authenticated;
