create or replace function public.line_engine_claim_automation() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a line_engine_automation; f timestamptz; begin
 select * into a from line_engine_automation where id=1 for update;
 if not found or not a.enabled then return null; end if;
 if a.last_started>now()-interval '23 hours' then return null; end if;
 select max(created_at) into f from line_engine_feedback where training_opt_in and created_at>now()-interval '30 days';
 if f is null or (a.last_feedback_at is not null and f<=a.last_feedback_at) then return null; end if;
 update line_engine_automation set last_started=now(),last_status='running' where id=1;
 return jsonb_build_object('projectId',a.project_id,'feedbackAt',f);
end $$;
revoke execute on function public.line_engine_claim_automation() from public,anon,authenticated;
grant execute on function public.line_engine_claim_automation() to service_role;
