create index if not exists legal_documents_created_by_idx on public.legal_documents(created_by);

create or replace function public.has_current_legal_consent(p_user_id uuid, p_audience text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.legal_documents d
    where d.active = true
      and d.audience in ('ALL', upper(p_audience))
      and not exists (
        select 1
        from public.legal_acceptances a
        where a.user_id = p_user_id
          and a.document_id = d.id
      )
  );
$$;

revoke all on function public.has_current_legal_consent(uuid,text) from public, anon, authenticated;
grant execute on function public.has_current_legal_consent(uuid,text) to service_role;
comment on function public.has_current_legal_consent(uuid,text) is 'Service-only check for current versioned CLICK-FOOD legal consent.';
