alter table public.coaching_sessions
  add column pending_follow_up_key text;

create unique index coaching_recommendations_one_per_session_idx
  on public.coaching_recommendations (session_id);

create or replace function public.issue_coaching_follow_up(
  p_user_id uuid,
  p_session_id uuid,
  p_expected_follow_up_count integer,
  p_question_key text,
  p_question_payload jsonb,
  p_context jsonb,
  p_answers jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  select follow_up_count into v_count
  from public.coaching_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found or v_count <> p_expected_follow_up_count then return null; end if;

  update public.coaching_sessions
  set follow_up_count = follow_up_count + 1,
      pending_follow_up_key = p_question_key,
      context = p_context || pg_catalog.jsonb_build_object('answers', p_answers),
      updated_at = pg_catalog.now()
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active'
    and follow_up_count < 2
    and pending_follow_up_key is null
  returning follow_up_count into v_count;

  if not found then return null; end if;

  insert into public.coaching_messages (user_id, session_id, role, payload)
  values (p_user_id, p_session_id, 'assistant', p_question_payload);
  return v_count;
end;
$$;

create or replace function public.consume_coaching_follow_up(
  p_user_id uuid,
  p_session_id uuid,
  p_question_key text,
  p_answer_payload jsonb,
  p_context jsonb,
  p_answers jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform 1 from public.coaching_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  update public.coaching_sessions
  set pending_follow_up_key = null,
      context = p_context || pg_catalog.jsonb_build_object('answers', p_answers),
      updated_at = pg_catalog.now()
  where id = p_session_id
    and user_id = p_user_id
    and status = 'active'
    and pending_follow_up_key = p_question_key;

  if not found then return false; end if;

  insert into public.coaching_messages (user_id, session_id, role, payload)
  values (p_user_id, p_session_id, 'user', p_answer_payload);
  return true;
end;
$$;

create or replace function public.finalize_coaching_session(
  p_user_id uuid,
  p_session_id uuid,
  p_action_key text,
  p_action_version integer,
  p_evidence_keys jsonb,
  p_metric_snapshot jsonb,
  p_response jsonb,
  p_context jsonb,
  p_answers jsonb,
  p_answered_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_recommendation_id uuid;
  v_response jsonb;
begin
  select status into v_status
  from public.coaching_sessions
  where id = p_session_id and user_id = p_user_id
  for update;

  if not found then return null; end if;

  if v_status = 'answered' then
    select id into v_recommendation_id
    from public.coaching_recommendations
    where session_id = p_session_id and user_id = p_user_id;
    select payload -> 'response' into v_response
    from public.coaching_messages
    where session_id = p_session_id and user_id = p_user_id
      and role = 'assistant' and payload ->> 'kind' = 'answer'
    order by created_at asc limit 1;
    return pg_catalog.jsonb_build_object(
      'recommendationId', v_recommendation_id,
      'response', v_response,
      'created', false
    );
  end if;

  if exists (
    select 1 from public.coaching_sessions
    where id = p_session_id and user_id = p_user_id
      and pending_follow_up_key is not null
  ) then return null; end if;

  insert into public.coaching_recommendations (
    user_id, session_id, action_key, action_version, evidence_keys, metric_snapshot
  ) values (
    p_user_id, p_session_id, p_action_key, p_action_version,
    p_evidence_keys, p_metric_snapshot
  )
  on conflict (session_id) do nothing
  returning id into v_recommendation_id;

  if v_recommendation_id is null then
    select id into v_recommendation_id
    from public.coaching_recommendations
    where session_id = p_session_id and user_id = p_user_id;
  end if;

  insert into public.coaching_messages (user_id, session_id, role, payload)
  values (
    p_user_id, p_session_id, 'assistant',
    pg_catalog.jsonb_build_object('kind', 'answer', 'response', p_response)
  );

  update public.coaching_sessions
  set status = 'answered', answered_at = p_answered_at,
      pending_follow_up_key = null,
      context = p_context || pg_catalog.jsonb_build_object('answers', p_answers),
      updated_at = pg_catalog.now()
  where id = p_session_id and user_id = p_user_id and status = 'active';

  return pg_catalog.jsonb_build_object(
    'recommendationId', v_recommendation_id,
    'response', p_response,
    'created', true
  );
end;
$$;

revoke all on function public.issue_coaching_follow_up(uuid, uuid, integer, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.issue_coaching_follow_up(uuid, uuid, integer, text, jsonb, jsonb, jsonb)
  to service_role;

revoke all on function public.consume_coaching_follow_up(uuid, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_coaching_follow_up(uuid, uuid, text, jsonb, jsonb, jsonb)
  to service_role;

revoke all on function public.finalize_coaching_session(uuid, uuid, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_coaching_session(uuid, uuid, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz)
  to service_role;
