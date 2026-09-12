create or replace function public.line_engine_finish(p_id uuid,p_status text,p_result jsonb,p_input bigint,p_output bigint,p_cost bigint,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status not in ('completed','failed','uncertain') or coalesce(p_input,0)<0 or coalesce(p_output,0)<0 or coalesce(p_cost,0)<0 then raise exception 'invalid_finish'; end if;
 update line_engine_requests set status=p_status,result=p_result,completed_at=now(),error_code=p_error,
 input_tokens=p_input,output_tokens=p_output,
 units=case when p_input is not null and p_output is not null then p_input+p_output else units end,
 images=case when p_status='failed' and p_cost=0 then 0 else images end,
 cost_micros=coalesce(p_cost,cost_micros),cost_estimated=(p_cost is null)
 where id=p_id and status='processing';
 return found;
end $$;
revoke execute on function public.line_engine_finish(uuid,text,jsonb,bigint,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.line_engine_finish(uuid,text,jsonb,bigint,bigint,bigint,text) to service_role;
