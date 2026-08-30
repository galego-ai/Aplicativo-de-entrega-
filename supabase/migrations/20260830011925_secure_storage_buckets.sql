insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('driver-documents','driver-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
  ('store-media','store-media',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists driver_documents_insert_own on storage.objects;
create policy driver_documents_insert_own on storage.objects for insert to authenticated
with check (bucket_id='driver-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists driver_documents_select_own_or_admin on storage.objects;
create policy driver_documents_select_own_or_admin on storage.objects for select to authenticated
using (bucket_id='driver-documents' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.is_admin()));

drop policy if exists driver_documents_delete_own on storage.objects;
create policy driver_documents_delete_own on storage.objects for delete to authenticated
using (bucket_id='driver-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.drivers d join public.driver_documents dd on dd.driver_id=d.id where d.user_id=(select auth.uid()) and dd.file_path=storage.objects.name and dd.status in ('PENDING','REJECTED')));

drop policy if exists store_media_insert_managers on storage.objects;
create policy store_media_insert_managers on storage.objects for insert to authenticated
with check (bucket_id='store-media' and (private.is_admin() or exists(select 1 from public.store_memberships sm where sm.user_id=(select auth.uid()) and sm.active=true and sm.role in ('OWNER','MANAGER') and sm.store_id::text=(storage.foldername(name))[1])));

drop policy if exists store_media_select_managers on storage.objects;
create policy store_media_select_managers on storage.objects for select to authenticated
using (bucket_id='store-media' and (private.is_admin() or exists(select 1 from public.store_memberships sm where sm.user_id=(select auth.uid()) and sm.active=true and sm.role in ('OWNER','MANAGER') and sm.store_id::text=(storage.foldername(name))[1])));

drop policy if exists store_media_update_managers on storage.objects;
create policy store_media_update_managers on storage.objects for update to authenticated
using (bucket_id='store-media' and (private.is_admin() or exists(select 1 from public.store_memberships sm where sm.user_id=(select auth.uid()) and sm.active=true and sm.role in ('OWNER','MANAGER') and sm.store_id::text=(storage.foldername(name))[1])))
with check (bucket_id='store-media' and (private.is_admin() or exists(select 1 from public.store_memberships sm where sm.user_id=(select auth.uid()) and sm.active=true and sm.role in ('OWNER','MANAGER') and sm.store_id::text=(storage.foldername(name))[1])));

drop policy if exists store_media_delete_managers on storage.objects;
create policy store_media_delete_managers on storage.objects for delete to authenticated
using (bucket_id='store-media' and (private.is_admin() or exists(select 1 from public.store_memberships sm where sm.user_id=(select auth.uid()) and sm.active=true and sm.role in ('OWNER','MANAGER') and sm.store_id::text=(storage.foldername(name))[1])));

create index if not exists idx_driver_documents_status_created on public.driver_documents(status,created_at desc);
create index if not exists idx_driver_documents_type_created on public.driver_documents(driver_id,document_type,created_at desc);
