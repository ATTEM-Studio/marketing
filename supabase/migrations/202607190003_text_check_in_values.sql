drop function if exists public.complete_action_plan(uuid, numeric, numeric, text);

alter table public.check_ins
  alter column before_value type text using before_value::text,
  alter column after_value type text using after_value::text;

create or replace function public.complete_action_plan(
  p_action_plan_id uuid,
  p_before_value text,
  p_after_value text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.action_plans%rowtype;
  v_check_in public.check_ins%rowtype;
begin
  if v_user_id is null
    or not exists (
      select 1 from public.profiles
      where id = v_user_id and access_status = 'active'
    ) then
    raise exception 'action_not_found' using errcode = 'P0001';
  end if;

  select * into v_action
  from public.action_plans
  where id = p_action_plan_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'action_not_found' using errcode = 'P0001';
  end if;

  select * into v_check_in
  from public.check_ins
  where action_plan_id = v_action.id and user_id = v_user_id
  order by recorded_at desc
  limit 1;

  if v_action.status = 'completed' then
    if not found then
      raise exception 'completion_not_found' using errcode = 'P0001';
    end if;
  else
    insert into public.check_ins (
      user_id, action_plan_id, before_value, after_value, note
    ) values (
      v_user_id, v_action.id, p_before_value, p_after_value, p_note
    ) returning * into v_check_in;

    update public.action_plans
    set status = 'completed', updated_at = now()
    where id = v_action.id and user_id = v_user_id
    returning * into v_action;
  end if;

  return jsonb_build_object(
    'id', v_action.id,
    'assessment_id', v_action.assessment_id,
    'action_key', v_action.action_key,
    'action_snapshot', v_action.action_snapshot,
    'status', v_action.status,
    'check_in_due_at', v_action.check_in_due_at,
    'check_in', jsonb_build_object(
      'before_value', v_check_in.before_value,
      'after_value', v_check_in.after_value,
      'note', v_check_in.note
    )
  );
end;
$$;

revoke update on table public.action_plans from authenticated;
revoke insert, update on table public.check_ins from authenticated;
revoke all on function public.complete_action_plan(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_action_plan(uuid, text, text, text) to authenticated;
