create or replace function public.resolve_delivery_incident_service(p_delivery_id uuid,p_action text,p_actor_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.resolve_delivery_incident_atomic(p_delivery_id,p_action,p_actor_id);
$$;
revoke all on function public.resolve_delivery_incident_service(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.resolve_delivery_incident_service(uuid,text,uuid) to service_role;
