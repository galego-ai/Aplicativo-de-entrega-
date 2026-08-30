grant insert on public.driver_documents to authenticated;

drop policy if exists driver_documents_insert_own on public.driver_documents;
create policy driver_documents_insert_own on public.driver_documents
for insert to authenticated
with check (
  status='PENDING'
  and reviewed_by is null
  and reviewed_at is null
  and rejection_reason is null
  and exists (
    select 1 from public.drivers d
    where d.id=driver_documents.driver_id
      and d.user_id=(select auth.uid())
  )
  and split_part(file_path,'/',1)=(select auth.uid())::text
);

create unique index if not exists uq_driver_pending_doc_type
on public.driver_documents(driver_id,document_type)
where status='PENDING';
