create table if not exists public.line_engine_projects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 enabled boolean not null default true, images_enabled boolean not null default false,
 daily_units bigint not null default 100000 check(daily_units between 0 and 100000000),
 monthly_units bigint not null default 1000000 check(monthly_units between 0 and 1000000000),
 daily_images int not null default 5 check(daily_images between 0 and 10000),
 monthly_images int not null default 30 check(monthly_images between 0 and 100000),
 daily_cost_micros bigint not null default 2000000 check(daily_cost_micros between 0 and 1000000000),
 monthly_cost_micros bigint not null default 10000000 check(monthly_cost_micros between 0 and 10000000000),
 rpm int not null default 10 check(rpm between 1 and 600), concurrency int not null default 2 check(concurrency between 1 and 20),
 created_at timestamptz not null default now()
);
create table if not exists public.line_engine_keys (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.line_engine_projects(id),
 name text not null check(length(name) between 1 and 80), prefix text not null, digest text unique not null check(length(digest)=64),
 scopes text[] not null check(scopes <@ array['text','images','feedback']),
 revoked_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.line_engine_policies (
 id uuid primary key default gen_random_uuid(), version text unique not null check(length(version) between 1 and 80),
 instructions text not null check(length(instructions)<=8000), status text not null default 'draft' check(status in ('draft','tested','published','retired')),
 evaluation jsonb, created_at timestamptz not null default now(), published_at timestamptz
);
create unique index if not exists line_engine_one_policy on public.line_engine_policies ((true)) where status='published';
insert into public.line_engine_policies(version,instructions,status,published_at)
 values('1.0.0','Yanıtı kullanıcının amacına göre düzenle. Kodda hata sınırlarını ve test edilebilir adımları göster. Bilmediğini belirt.','published',now()) on conflict(version) do nothing;
create table if not exists public.line_engine_requests (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.line_engine_projects(id),
 key_id uuid not null references public.line_engine_keys(id), operation_key text not null, body_hash text not null,
 kind text not null check(kind in ('text','image','evaluation')), task text, policy_version text,
 model text not null, status text not null default 'processing' check(status in ('processing','completed','failed','uncertain')),
 units bigint not null check(units>=0), images int not null default 0, cost_micros bigint not null check(cost_micros>=0),
 input_tokens bigint, output_tokens bigint, cost_estimated boolean not null default true,
 result jsonb, error_code text, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(project_id,operation_key)
);
create index if not exists line_engine_usage on public.line_engine_requests(project_id,created_at);
create table if not exists public.line_engine_assets (
 id uuid primary key default gen_random_uuid(), request_id uuid unique not null references public.line_engine_requests(id),
 project_id uuid not null references public.line_engine_projects(id), storage_path text unique not null,
 deleted_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.line_engine_feedback (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.line_engine_requests(id),
 key_id uuid not null references public.line_engine_keys(id), rating text not null check(rating in ('up','down')),
 note text check(length(note)<=2000), training_opt_in boolean not null default false,
 created_at timestamptz not null default now(), unique(request_id,key_id),
 check(training_opt_in or note is null)
);
create table if not exists public.line_engine_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','operator','viewer'))
);
create table if not exists public.line_engine_sessions (
 digest text primary key, user_id uuid not null references public.line_engine_admins(user_id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists public.line_engine_login_limits (
 fingerprint text primary key, attempts int not null, window_start timestamptz not null
);
create table if not exists public.line_engine_audit (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id),
 action text not null, target text, created_at timestamptz not null default now()
);
create table if not exists public.line_engine_automation (
 id int primary key check(id=1), enabled boolean not null default false,
 project_id uuid not null references public.line_engine_projects(id),
 last_started timestamptz, last_completed timestamptz, last_feedback_at timestamptz,
 last_status text, last_policy_id uuid references public.line_engine_policies(id)
);
do $$ declare t text; begin
 foreach t in array array['projects','keys','policies','requests','assets','feedback','admins','sessions','login_limits','audit','automation'] loop
 execute format('alter table public.line_engine_%I enable row level security',t);
 execute format('revoke all on public.line_engine_%I from anon, authenticated',t);
 execute format('grant all on public.line_engine_%I to service_role',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('line-engine-assets','line-engine-assets',false,8388608,array['image/webp','image/png']) on conflict(id) do nothing;

create or replace function public.line_engine_reserve(
 p_key uuid,p_operation text,p_hash text,p_kind text,p_task text,p_policy text,p_model text,p_units bigint,p_cost bigint
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k line_engine_keys; p line_engine_projects; r line_engine_requests;
 du bigint; mu bigint; di bigint; mi bigint; dc bigint; mc bigint; n int;
begin
 select * into k from line_engine_keys where id=p_key;
 if not found then return jsonb_build_object('error','invalid_key'); end if;
 select * into p from line_engine_projects where id=k.project_id for update;
 -- Re-read under the project serialization lock: revocation and quota changes take effect before new requests.
 select * into k from line_engine_keys where id=p_key;
 if k.revoked_at is not null or k.expires_at<=now() then return jsonb_build_object('error','invalid_key'); end if;
 if not p.enabled then return jsonb_build_object('error','project_disabled'); end if;
 if not (case when p_kind='image' then 'images' else 'text' end = any(k.scopes)) then return jsonb_build_object('error','scope_denied'); end if;
 if p_kind='image' and not p.images_enabled then return jsonb_build_object('error','images_disabled'); end if;
 if p_units<0 or p_cost<0 or p_kind not in ('text','image','evaluation') then raise exception 'invalid_reservation'; end if;
 select * into r from line_engine_requests where project_id=p.id and operation_key=p_operation;
 if found then
   if r.body_hash<>p_hash then return jsonb_build_object('error','idempotency_conflict'); end if;
   return jsonb_build_object('existing',true,'request',to_jsonb(r));
 end if;
 update line_engine_requests set status='uncertain',error_code='provider_timeout'
 where project_id=p.id and status='processing' and created_at<now()-interval '5 minutes';
 select count(*) into n from line_engine_requests where project_id=p.id and created_at>now()-interval '1 minute';
 if n>=p.rpm then return jsonb_build_object('error','rate_limited'); end if;
 select count(*) into n from line_engine_requests where project_id=p.id and status='processing';
 if n>=p.concurrency then return jsonb_build_object('error','concurrency_limited'); end if;
 select coalesce(sum(units) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),
 coalesce(sum(units),0),coalesce(sum(images) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),
 coalesce(sum(images),0),coalesce(sum(cost_micros) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0),coalesce(sum(cost_micros),0)
 into du,mu,di,mi,dc,mc from line_engine_requests where project_id=p.id and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 if du+p_units>p.daily_units or mu+p_units>p.monthly_units then return jsonb_build_object('error','token_quota_exceeded'); end if;
 if di+(p_kind='image')::int>p.daily_images or mi+(p_kind='image')::int>p.monthly_images then return jsonb_build_object('error','image_quota_exceeded'); end if;
 if dc+p_cost>p.daily_cost_micros or mc+p_cost>p.monthly_cost_micros then return jsonb_build_object('error','cost_limit_exceeded'); end if;
 insert into line_engine_requests(project_id,key_id,operation_key,body_hash,kind,task,policy_version,model,units,images,cost_micros)
 values(p.id,k.id,p_operation,p_hash,p_kind,p_task,p_policy,p_model,p_units,(p_kind='image')::int,p_cost) returning * into r;
 return jsonb_build_object('existing',false,'request',to_jsonb(r));
end $$;

create or replace function public.line_engine_finish(p_id uuid,p_status text,p_result jsonb,p_input bigint,p_output bigint,p_cost bigint,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status not in ('completed','failed','uncertain') or coalesce(p_input,0)<0 or coalesce(p_output,0)<0 or coalesce(p_cost,0)<0 then raise exception 'invalid_finish'; end if;
 update line_engine_requests set status=p_status,result=p_result,completed_at=now(),error_code=p_error,
 input_tokens=p_input,output_tokens=p_output,
 units=case when p_input is not null and p_output is not null then p_input+p_output else units end,
 cost_micros=coalesce(p_cost,cost_micros),cost_estimated=(p_cost is null)
 where id=p_id and status='processing';
 return found;
end $$;

create or replace function public.line_engine_login_attempt(p_fingerprint text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n int; begin
 insert into line_engine_login_limits values(p_fingerprint,1,now())
 on conflict(fingerprint) do update set
 attempts=case when line_engine_login_limits.window_start<now()-interval '15 minutes' then 1 else line_engine_login_limits.attempts+1 end,
 window_start=case when line_engine_login_limits.window_start<now()-interval '15 minutes' then now() else line_engine_login_limits.window_start end
 returning attempts into n;
 return n<=8;
end $$;

create or replace function public.line_engine_publish(p_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p line_engine_policies; begin
 perform pg_advisory_xact_lock(59012912);
 select * into p from line_engine_policies where id=p_id for update;
 if not found or p.status not in ('tested','retired') or coalesce((p.evaluation->>'passed')::boolean,false)=false then return false; end if;
 if p.status='tested' and p.evaluation->>'baselineVersion'<>(select version from line_engine_policies where status='published') then return false; end if;
 update line_engine_policies set status='retired' where status='published';
 update line_engine_policies set status='published',published_at=now() where id=p_id;
 return true;
end $$;
create or replace function public.line_engine_claim_automation() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a line_engine_automation; f timestamptz; begin
 select * into a from line_engine_automation where id=1 for update;
 if not found or not a.enabled then return null; end if;
 if a.last_started>now()-interval '23 hours' then return null; end if;
 select max(created_at) into f from line_engine_feedback where training_opt_in and created_at>now()-interval '30 days';
 if f is null or (a.last_feedback_at is not null and f<=a.last_feedback_at) then return null; end if;
 update line_engine_automation set last_started=now(),last_status='running',last_feedback_at=f where id=1;
 return jsonb_build_object('projectId',a.project_id);
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure as sig from pg_proc where pronamespace='public'::regnamespace and proname like 'line_engine_%' loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
