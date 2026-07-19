drop function if exists public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, date, date);

create function public.save_assessment_with_goal(
  p_store_id uuid,
  p_input_data jsonb,
  p_calculated_metrics jsonb,
  p_diagnosis jsonb,
  p_target_revenue numeric,
  p_allocation jsonb,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_assessment_id uuid;
  v_goal_id uuid;
  v_shortfall_revenue numeric;
  v_allocation_total numeric;
begin
  if v_user_id is null
    or not exists (
      select 1 from public.profiles
      where id = v_user_id and access_status = 'active'
    )
    or not exists (
      select 1 from public.stores
      where id = p_store_id and user_id = v_user_id
    ) then
    raise exception 'store_not_found' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_input_data) <> 'object'
    or jsonb_typeof(p_calculated_metrics) <> 'object'
    or jsonb_typeof(p_diagnosis) <> 'object'
    or jsonb_typeof(p_allocation) <> 'object'
    or jsonb_typeof(p_calculated_metrics -> 'shortfallRevenue') <> 'number' then
    raise exception 'invalid_goal_allocation' using errcode = 'P0001';
  end if;

  v_shortfall_revenue := (p_calculated_metrics ->> 'shortfallRevenue')::numeric;
  if v_shortfall_revenue < 0 then
    raise exception 'invalid_goal_allocation' using errcode = 'P0001';
  end if;

  if p_allocation <> '{}'::jsonb then
    if not (p_allocation ?& array[
      'newCustomerRevenue',
      'returningCustomerRevenue',
      'averageOrderValueRevenue'
    ])
      or exists (
        select 1
        from jsonb_object_keys(p_allocation) as allocation_key
        where allocation_key not in (
          'newCustomerRevenue',
          'returningCustomerRevenue',
          'averageOrderValueRevenue'
        )
      )
      or jsonb_typeof(p_allocation -> 'newCustomerRevenue') <> 'number'
      or jsonb_typeof(p_allocation -> 'returningCustomerRevenue') <> 'number'
      or jsonb_typeof(p_allocation -> 'averageOrderValueRevenue') <> 'number' then
      raise exception 'invalid_goal_allocation' using errcode = 'P0001';
    end if;

    select sum(value::numeric)
    into v_allocation_total
    from jsonb_each_text(p_allocation);

    if (p_allocation ->> 'newCustomerRevenue')::numeric < 0
      or (p_allocation ->> 'returningCustomerRevenue')::numeric < 0
      or (p_allocation ->> 'averageOrderValueRevenue')::numeric < 0
      or v_allocation_total <> v_shortfall_revenue then
      raise exception 'invalid_goal_allocation' using errcode = 'P0001';
    end if;
  end if;

  insert into public.assessments (user_id, store_id, input_data, calculated_metrics, diagnosis)
  values (v_user_id, p_store_id, p_input_data, p_calculated_metrics, p_diagnosis)
  returning id into v_assessment_id;

  insert into public.goals (
    user_id,
    store_id,
    assessment_id,
    target_revenue,
    allocation,
    period_start,
    period_end
  )
  values (
    v_user_id,
    p_store_id,
    v_assessment_id,
    p_target_revenue,
    p_allocation,
    p_period_start,
    p_period_end
  )
  returning id into v_goal_id;

  return v_goal_id;
end;
$$;

revoke all on function public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date) from public, anon;
grant execute on function public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date) to authenticated;
