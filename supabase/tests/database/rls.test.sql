begin;

select plan(59);

select has_table('public', 'profiles');
select has_table('public', 'invite_codes');
select has_table('public', 'pending_registrations');
select has_table('public', 'assessments');
select has_function('public', 'finalize_buyer_registration', array['uuid', 'text']);
select has_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'jsonb', 'date', 'date']);
select hasnt_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'date', 'date']);
select has_function('public', 'reserve_buyer_registration', array['text', 'text', 'text', 'text', 'text', 'boolean', 'boolean']);
select has_function('public', 'consume_invite_attempt', array['text']);
select has_function('public', 'cleanup_expired_buyer_registrations', array[]::text[]);
select has_function('public', 'complete_action_plan', array['uuid', 'text', 'text', 'text']);
select policies_are('public', 'assessments', array['assessment_owner_select', 'assessment_owner_insert']);
select policies_are('public', 'action_plans', array['action_owner_select', 'action_owner_insert', 'action_owner_update']);
select policies_are('public', 'check_ins', array['checkin_owner_select', 'checkin_owner_insert', 'checkin_owner_update']);
select ok((select relrowsecurity from pg_class where oid = 'public.pending_registrations'::regclass), 'pending registrations has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.invite_codes'::regclass), 'invite codes has RLS enabled');
select ok(not has_table_privilege('anon', 'public.pending_registrations', 'select'), 'anon cannot read pending PII');
select ok(not has_table_privilege('authenticated', 'public.pending_registrations', 'select'), 'authenticated cannot read pending PII');
select ok(not has_table_privilege('authenticated', 'public.invite_codes', 'select'), 'authenticated cannot read invite hashes');
select ok(not has_table_privilege('authenticated', 'public.stores', 'insert'), 'clients cannot create stores directly');
select ok(not has_table_privilege('authenticated', 'public.consent_events', 'insert'), 'clients cannot create consent events directly');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'clients cannot alter email or access status');
select ok(not has_table_privilege('authenticated', 'public.action_plans', 'update'), 'clients cannot complete an action plan directly');
select ok(not has_table_privilege('authenticated', 'public.check_ins', 'insert'), 'clients cannot insert a check-in directly');
select ok(not has_function_privilege('authenticated', 'public.finalize_buyer_registration(uuid, text)', 'execute'), 'only server can finalize registration');
select ok(not has_function_privilege('authenticated', 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)', 'execute'), 'only server can reserve an invite');
select ok(not has_function_privilege('authenticated', 'public.cleanup_expired_buyer_registrations()', 'execute'), 'only server can clean expired PII');
select ok(has_function_privilege('authenticated', 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)', 'execute'), 'active authenticated buyers can save an assessment through the RPC');
select is((select prosecdef from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), true, 'finalizer is security definer');
select is((select prosecdef from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), true, 'reservation is security definer');
select is((select prosecdef from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), true, 'action completion is security definer');
select is((select prosecdef from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), true, 'assessment save is security definer');
select like((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), '%search_path=public%', 'finalizer pins search path');
select like((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), '%search_path=public%', 'action completion pins search path');
select like((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), '%search_path=public%', 'assessment save pins search path');
select like((select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), '%for update%', 'reservation locks its rows atomically');
select like((select prosrc from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), '%for update%', 'action completion locks its plan atomically');
select like((select prosrc from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), '%v_action.status = ''completed''%', 'action completion returns the existing result when retried');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'check_ins_action_plan_user_unique_idx'), 'a check-in is unique per completed action plan');
select like((select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), '%v_invite.code_hash = p_code_hash%', 'an idempotent pending reservation requires the same code hash');
select like((select prosrc from pg_proc where oid = 'public.consume_invite_attempt(text)'::regprocedure), '%pg_advisory_xact_lock%', 'rate limiting locks each IP rolling window atomically');
select like((select prosrc from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), '%access_status = ''active''%', 'assessment RPC rejects inactive users');
select like((select prosrc from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), '%p_allocation%', 'assessment RPC validates the saved allocation');
select like((select with_check from pg_policies where schemaname = 'public' and tablename = 'assessments' and policyname = 'assessment_owner_insert'), '%access_status = ''active''%', 'assessment INSERT RLS requires an active profile');
select ok(exists (select 1 from pg_extension where extname = 'pg_cron'), 'pg_cron is installed for scheduled cleanup');
select ok(exists (select 1 from cron.job where jobname = 'cleanup-expired-buyer-registrations'), 'expired registration cleanup is scheduled');
select like(obj_description('public.cleanup_expired_buyer_registrations()'::regprocedure, 'pg_proc'), '%35 minutes%', 'cleanup retention contract includes the cron delay');
select like(obj_description('public.finalize_buyer_registration(uuid, text)'::regprocedure, 'pg_proc'), '%explicit user confirmation%', 'finalization contract prohibits automatic callback completion');

insert into public.invite_attempts (ip_hash, attempted_at)
select repeat('a', 64), now() - interval '14 minutes 59 seconds'
from generate_series(1, 5);
select is(public.consume_invite_attempt(repeat('a', 64)), false, 'a sixth request inside the rolling 15-minute window is rejected');
update public.invite_attempts
set attempted_at = now() - interval '15 minutes 1 second'
where ip_hash = repeat('a', 64);
select is(public.consume_invite_attempt(repeat('a', 64)), true, 'a request immediately after the rolling window is accepted');

set local session_replication_role = replica;
insert into public.profiles (id, name, email, region, business_name, access_status)
values
  ('33333333-3333-3333-3333-333333333333', 'suspended', 'suspended@example.test', 'seoul', 'store', 'suspended'),
  ('44444444-4444-4444-4444-444444444444', 'active', 'active@example.test', 'seoul', 'active store', 'active');
insert into public.stores (id, user_id, name, region)
values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'active store', 'seoul');
insert into public.assessments (id, user_id, store_id, input_data, calculated_metrics, diagnosis)
values ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);
insert into public.action_plans (id, user_id, store_id, assessment_id, action_key, action_snapshot, status)
values ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'local-discovery', '{"metric":"길찾기 수"}'::jsonb, 'scheduled');
set local session_replication_role = origin;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select throws_ok(
  $$insert into public.stores (user_id, name, region) values ('11111111-1111-1111-1111-111111111111', 'direct', 'seoul')$$,
  '42501', null,
  'an authenticated user cannot create a first store directly'
);
select throws_ok(
  $$insert into public.assessments (user_id, store_id, input_data, calculated_metrics, diagnosis) values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '42501', null,
  'an authenticated user without an active profile cannot insert an assessment'
);
select throws_ok(
  $$select public.save_assessment_with_goal('22222222-2222-2222-2222-222222222222', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 0, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'store_not_found',
  'the assessment RPC rejects a user without an active profile'
);
reset role;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
set local role authenticated;
select throws_ok(
  $$insert into public.assessments (user_id, store_id, input_data, calculated_metrics, diagnosis) values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '42501', null,
  'a suspended user cannot insert an assessment'
);
select throws_ok(
  $$select public.save_assessment_with_goal('22222222-2222-2222-2222-222222222222', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 0, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'store_not_found',
  'the assessment RPC rejects a suspended profile'
);
reset role;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
set local role authenticated;
select ok(
  (
    with saved as (
      select public.save_assessment_with_goal(
        '55555555-5555-5555-5555-555555555555',
        '{}'::jsonb,
        '{"shortfallRevenue": 10000000}'::jsonb,
        '{}'::jsonb,
        40000000,
        '{"newCustomerRevenue": 6000000, "returningCustomerRevenue": 2000000, "averageOrderValueRevenue": 2000000}'::jsonb,
        current_date,
        current_date
      ) as id
    )
    select allocation = '{"newCustomerRevenue": 6000000, "returningCustomerRevenue": 2000000, "averageOrderValueRevenue": 2000000}'::jsonb
    from public.goals
    join saved on saved.id = public.goals.id
  ),
  'the assessment RPC saves a valid direct allocation in goals'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 10000000}'::jsonb, '{}'::jsonb, 40000000, '{"newCustomerRevenue": 9999999, "returningCustomerRevenue": 0, "averageOrderValueRevenue": 0}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects an allocation that does not exactly match the shortfall'
);
select is(
  public.complete_action_plan(
    '77777777-7777-7777-7777-777777777777',
    '길찾기 7회',
    '길찾기 12회',
    '대표사진 변경'
  )->'check_in'->>'before_value',
  '길찾기 7회',
  'the action completion RPC stores a unit-bearing before value'
);
select is(
  public.complete_action_plan(
    '77777777-7777-7777-7777-777777777777',
    '다른 값',
    '다른 값',
    'retry'
  )->'check_in'->>'after_value',
  '길찾기 12회',
  'an idempotent retry returns the original unit-bearing result'
);
reset role;

select * from finish();

rollback;
