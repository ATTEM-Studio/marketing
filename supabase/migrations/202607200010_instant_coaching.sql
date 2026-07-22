create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null,
  assessment_id uuid not null,
  concern_key text not null check (concern_key in (
    'not_visible',
    'visible_no_visit',
    'ads_no_customers',
    'low_average_order_value',
    'low_returning',
    'unknown'
  )),
  initial_question text not null check (char_length(trim(initial_question)) between 1 and 500),
  intent text not null check (intent in (
    'discovery',
    'selection',
    'confidence',
    'visit',
    'returning',
    'profit',
    'unknown'
  )),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'answered')),
  follow_up_count integer not null default 0 check (follow_up_count between 0 and 2),
  context jsonb not null check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint coaching_sessions_store_owner_fkey
    foreign key (store_id, user_id) references public.stores(id, user_id) on delete cascade,
  constraint coaching_sessions_assessment_owner_fkey
    foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade,
  check ((status = 'active' and answered_at is null) or (status = 'answered' and answered_at is not null))
);

create table public.coaching_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  constraint coaching_messages_session_owner_fkey
    foreign key (session_id, user_id) references public.coaching_sessions(id, user_id) on delete cascade
);

create table public.coaching_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  action_key text not null check (char_length(trim(action_key)) between 1 and 120),
  action_version integer not null check (action_version >= 1),
  evidence_keys jsonb not null check (jsonb_typeof(evidence_keys) = 'array'),
  metric_snapshot jsonb not null check (jsonb_typeof(metric_snapshot) = 'object'),
  feedback text check (feedback in ('helpful', 'too_hard', 'not_relevant')),
  created_at timestamptz not null default now(),
  constraint coaching_recommendations_session_owner_fkey
    foreign key (session_id, user_id) references public.coaching_sessions(id, user_id) on delete cascade
);

create table public.coaching_request_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index coaching_sessions_user_id_created_at_idx
  on public.coaching_sessions (user_id, created_at desc);
create index coaching_messages_session_id_created_at_idx
  on public.coaching_messages (session_id, created_at asc);
create index coaching_messages_user_id_created_at_idx
  on public.coaching_messages (user_id, created_at desc);
create index coaching_recommendations_session_id_created_at_idx
  on public.coaching_recommendations (session_id, created_at desc);
create index coaching_recommendations_user_id_created_at_idx
  on public.coaching_recommendations (user_id, created_at desc);
create index coaching_request_events_user_id_requested_at_idx
  on public.coaching_request_events (user_id, requested_at desc);

alter table public.coaching_sessions enable row level security;
alter table public.coaching_messages enable row level security;
alter table public.coaching_recommendations enable row level security;
alter table public.coaching_request_events enable row level security;

revoke all on table public.coaching_sessions, public.coaching_messages,
  public.coaching_recommendations, public.coaching_request_events
  from public, anon, authenticated;

grant select on table public.coaching_sessions, public.coaching_messages,
  public.coaching_recommendations to authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.coaching_sessions,
  public.coaching_recommendations to service_role;
grant select, insert on table public.coaching_messages to service_role;

create policy coaching_session_owner_select on public.coaching_sessions
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and access_status = 'active'
    )
  );
create policy coaching_message_owner_select on public.coaching_messages
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and access_status = 'active'
    )
  );
create policy coaching_recommendation_owner_select on public.coaching_recommendations
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and access_status = 'active'
    )
  );

create or replace function public.consume_coaching_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_count integer;
begin
  if p_user_id is null then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  delete from public.coaching_request_events
  where user_id = p_user_id
    and requested_at < now() - interval '1 hour';

  select count(*) into v_request_count
  from public.coaching_request_events
  where user_id = p_user_id
    and requested_at >= now() - interval '1 hour';

  if v_request_count >= 20 then
    return false;
  end if;

  insert into public.coaching_request_events (user_id)
  values (p_user_id);

  return true;
end;
$$;

revoke all on function public.consume_coaching_request(uuid)
  from public, anon, authenticated;
grant execute on function public.consume_coaching_request(uuid) to service_role;
