insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('driver-avatars','driver-avatars',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Escrita permanece exclusiva do backend/service role. Não criamos políticas de INSERT/UPDATE para anon/authenticated.
