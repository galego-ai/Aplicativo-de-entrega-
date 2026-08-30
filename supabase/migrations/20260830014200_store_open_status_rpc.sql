create or replace function public.store_is_open(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$ select private.is_store_open(p_store_id); $$;
revoke all on function public.store_is_open(uuid) from public,anon;
grant execute on function public.store_is_open(uuid) to authenticated,service_role;
