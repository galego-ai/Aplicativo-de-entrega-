create or replace function public.replace_store_hours_atomic(
  p_store_id uuid,
  p_actor_id uuid,
  p_hours jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row jsonb;
  v_weekday integer;
  v_closed boolean;
  v_opens time;
  v_closes time;
  v_seen integer[] := '{}';
  v_count integer := 0;
begin
  if p_store_id is null or p_actor_id is null then raise exception 'STORE_AND_ACTOR_REQUIRED'; end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then
    raise exception 'SEVEN_DAYS_REQUIRED';
  end if;

  for v_row in select value from jsonb_array_elements(p_hours) loop
    begin
      v_weekday := (v_row->>'weekday')::integer;
      v_closed := coalesce((v_row->>'closed')::boolean,false);
    exception when others then
      raise exception 'INVALID_HOURS_ROW';
    end;

    if v_weekday < 0 or v_weekday > 6 or v_weekday = any(v_seen) then
      raise exception 'INVALID_OR_DUPLICATE_WEEKDAY';
    end if;
    v_seen := array_append(v_seen,v_weekday);

    if v_closed then
      v_opens := null;
      v_closes := null;
    else
      if nullif(v_row->>'opens_at','') is null or nullif(v_row->>'closes_at','') is null then
        raise exception 'OPEN_AND_CLOSE_REQUIRED';
      end if;
      begin
        v_opens := (v_row->>'opens_at')::time;
        v_closes := (v_row->>'closes_at')::time;
      exception when others then
        raise exception 'INVALID_TIME_VALUE';
      end;
    end if;
  end loop;

  if array_length(v_seen,1) <> 7 then raise exception 'SEVEN_DAYS_REQUIRED'; end if;

  delete from public.store_business_hours where store_id=p_store_id;

  for v_row in select value from jsonb_array_elements(p_hours) loop
    v_weekday := (v_row->>'weekday')::integer;
    v_closed := coalesce((v_row->>'closed')::boolean,false);
    if v_closed then
      v_opens := null; v_closes := null;
    else
      v_opens := (v_row->>'opens_at')::time;
      v_closes := (v_row->>'closes_at')::time;
    end if;
    insert into public.store_business_hours(store_id,weekday,opens_at,closes_at,closed)
    values(p_store_id,v_weekday,v_opens,v_closes,v_closed);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.replace_store_hours_atomic(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_store_hours_atomic(uuid,uuid,jsonb) to service_role;

revoke insert, update, delete on public.store_business_hours from authenticated;
