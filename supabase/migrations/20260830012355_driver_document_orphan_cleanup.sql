drop policy if exists driver_documents_delete_own on storage.objects;
create policy driver_documents_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id='driver-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (
    not exists (select 1 from public.driver_documents dd where dd.file_path=storage.objects.name)
    or exists (
      select 1 from public.drivers d
      join public.driver_documents dd on dd.driver_id=d.id
      where d.user_id=(select auth.uid())
        and dd.file_path=storage.objects.name
        and dd.status in ('PENDING','REJECTED')
    )
  )
);
