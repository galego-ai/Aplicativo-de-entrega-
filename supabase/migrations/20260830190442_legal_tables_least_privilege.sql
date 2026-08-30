revoke all on table public.legal_documents from anon, authenticated;
grant select on table public.legal_documents to anon, authenticated;

revoke all on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;
