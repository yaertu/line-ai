create extension if not exists pgcrypto;

create table if not exists public.line_ai_installations (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null unique check (length(secret_hash) = 64),
  ip_hash text not null check (length(ip_hash) = 64),
  user_agent_hash text not null check (length(user_agent_hash) = 64),
  status text not null default 'active' check (status in ('active', 'revoked')),
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.line_ai_registration_limits (
  ip_hash text not null check (length(ip_hash) = 64),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (ip_hash, window_started_at)
);

create table if not exists public.line_ai_conversations (
  installation_id uuid not null references public.line_ai_installations(id) on delete cascade,
  conversation_id text not null check (length(conversation_id) between 1 and 128),
  title text not null check (length(title) between 1 and 80),
  pinned boolean not null default false,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_bytes integer not null check (payload_bytes between 2 and 524288),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  primary key (installation_id, conversation_id)
);

create index if not exists line_ai_conversations_recent_idx
  on public.line_ai_conversations (installation_id, updated_at desc);

alter table public.line_ai_installations enable row level security;
alter table public.line_ai_registration_limits enable row level security;
alter table public.line_ai_conversations enable row level security;

revoke all on table public.line_ai_installations from anon, authenticated;
revoke all on table public.line_ai_registration_limits from anon, authenticated;
revoke all on table public.line_ai_conversations from anon, authenticated;

create or replace function public.register_line_ai_installation(
  p_secret_hash text,
  p_ip_hash text,
  p_user_agent_hash text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_attempts integer;
  v_id uuid;
begin
  if length(p_secret_hash) <> 64 or length(p_ip_hash) <> 64 or length(p_user_agent_hash) <> 64 then
    raise exception 'invalid_registration_payload';
  end if;

  insert into public.line_ai_registration_limits (ip_hash, window_started_at, attempts)
  values (p_ip_hash, v_window, 1)
  on conflict (ip_hash, window_started_at)
  do update set attempts = public.line_ai_registration_limits.attempts + 1
  returning attempts into v_attempts;

  if v_attempts > 8 then
    raise exception 'registration_rate_limited';
  end if;

  insert into public.line_ai_installations (secret_hash, ip_hash, user_agent_hash)
  values (p_secret_hash, p_ip_hash, p_user_agent_hash)
  returning id into v_id;

  delete from public.line_ai_registration_limits
  where window_started_at < now() - interval '2 hours';

  return v_id;
end;
$$;

create or replace function public.upsert_line_ai_conversation(
  p_installation_id uuid,
  p_conversation_id text,
  p_title text,
  p_pinned boolean,
  p_updated_at timestamptz,
  p_payload jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload_bytes integer := octet_length(p_payload::text);
  v_existing_bytes integer := 0;
  v_total_bytes bigint;
  v_version bigint;
begin
  if length(p_conversation_id) not between 1 and 128
    or length(p_title) not between 1 and 80
    or jsonb_typeof(p_payload) <> 'object'
    or v_payload_bytes > 524288
    or p_updated_at > now() + interval '5 minutes' then
    raise exception 'invalid_conversation_payload';
  end if;

  perform 1 from public.line_ai_installations
  where id = p_installation_id and status = 'active'
  for update;
  if not found then
    raise exception 'installation_not_active';
  end if;

  select payload_bytes into v_existing_bytes
  from public.line_ai_conversations
  where installation_id = p_installation_id and conversation_id = p_conversation_id;
  v_existing_bytes := coalesce(v_existing_bytes, 0);

  select coalesce(sum(payload_bytes), 0) - v_existing_bytes + v_payload_bytes
  into v_total_bytes
  from public.line_ai_conversations
  where installation_id = p_installation_id;
  if v_total_bytes > 3145728 then
    raise exception 'storage_quota_exceeded';
  end if;

  insert into public.line_ai_conversations (
    installation_id,
    conversation_id,
    title,
    pinned,
    payload,
    payload_bytes,
    updated_at
  ) values (
    p_installation_id,
    p_conversation_id,
    p_title,
    p_pinned,
    p_payload,
    v_payload_bytes,
    p_updated_at
  )
  on conflict (installation_id, conversation_id)
  do update set
    title = excluded.title,
    pinned = excluded.pinned,
    payload = excluded.payload,
    payload_bytes = excluded.payload_bytes,
    version = public.line_ai_conversations.version + 1,
    updated_at = excluded.updated_at
  returning version into v_version;

  return v_version;
end;
$$;

revoke all on function public.register_line_ai_installation(text, text, text) from public, anon, authenticated;
revoke all on function public.upsert_line_ai_conversation(uuid, text, text, boolean, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.register_line_ai_installation(text, text, text) to service_role;
grant execute on function public.upsert_line_ai_conversation(uuid, text, text, boolean, timestamptz, jsonb) to service_role;
