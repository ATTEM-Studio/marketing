begin;

select plan(150);

select has_table('public'::name, 'profiles'::name, 'profiles table exists');
select has_table('public'::name, 'invite_codes'::name, 'invite codes table exists');
select has_column(
  'public'::name,
  'invite_codes'::name,
  'is_reusable'::name,
  'invite codes support reusable access'
);
select has_table('public'::name, 'pending_registrations'::name, 'pending registrations table exists');
select has_table('public'::name, 'assessments'::name, 'assessments table exists');
select has_function('public', 'finalize_buyer_registration', array['uuid', 'text']);
select has_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'jsonb', 'date', 'date']);
select hasnt_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'date', 'date']);
select has_function('public', 'reserve_buyer_registration', array['text', 'text', 'text', 'text', 'text', 'boolean', 'boolean']);
select has_function('public', 'consume_invite_attempt', array['text']);
select has_function('public', 'cleanup_expired_buyer_registrations', array[]::text[]);
select has_function('public', 'complete_action_plan', array['uuid', 'text', 'text', 'text']);
select has_function('public', 'activate_anonymous_reader', array['uuid', 'text', 'text', 'text', 'text', 'text', 'boolean', 'boolean']);
select has_table('public'::name, 'coaching_sessions'::name, 'coaching sessions table exists');
select has_table('public'::name, 'coaching_messages'::name, 'coaching messages table exists');
select has_table('public'::name, 'coaching_recommendations'::name, 'coaching recommendations table exists');
select has_table('public'::name, 'coaching_request_events'::name, 'coaching request events table exists');
select has_function('public', 'consume_coaching_request', array['uuid']);
select has_table('public', 'admin_login_attempts', 'admin login attempts table exists');
select policies_are('public', 'assessments', array['assessment_owner_select']);
select policies_are('public', 'goals', array['goal_owner_select']);
select policies_are('public', 'action_plans', array['action_owner_select', 'action_owner_insert', 'action_owner_update']);
select policies_are('public', 'check_ins', array['checkin_owner_select', 'checkin_owner_insert', 'checkin_owner_update']);
select policies_are('public', 'coaching_sessions', array['coaching_session_owner_select']);
select policies_are('public', 'coaching_messages', array['coaching_message_owner_select']);
select policies_are('public', 'coaching_recommendations', array['coaching_recommendation_owner_select']);
select ok((select relrowsecurity from pg_class where oid = 'public.pending_registrations'::regclass), 'pending registrations has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.invite_codes'::regclass), 'invite codes has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.coaching_sessions'::regclass), 'coaching sessions has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.coaching_messages'::regclass), 'coaching messages has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.coaching_recommendations'::regclass), 'coaching recommendations has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.coaching_request_events'::regclass), 'coaching request events has RLS enabled');
select ok(not has_table_privilege('anon', 'public.pending_registrations', 'select'), 'anon cannot read pending PII');
select ok(not has_table_privilege('authenticated', 'public.pending_registrations', 'select'), 'authenticated cannot read pending PII');
select ok(not has_table_privilege('authenticated', 'public.invite_codes', 'select'), 'authenticated cannot read invite hashes');
select ok(not has_table_privilege('authenticated', 'public.coaching_request_events', 'select'), 'authenticated cannot read coaching rate events');
select ok(
  not has_table_privilege('anon', 'public.admin_login_attempts', 'select'),
  'anon cannot read admin login attempts'
);
select ok(has_table_privilege('authenticated', 'public.profiles', 'select'), 'authenticated can read their profile through RLS');
select ok(has_table_privilege('authenticated', 'public.consent_events', 'select'), 'authenticated can read their consent through RLS');
select ok(has_table_privilege('authenticated', 'public.stores', 'select'), 'authenticated can read their store through RLS');
select ok(has_table_privilege('authenticated', 'public.assessments', 'select'), 'authenticated can read their assessments through RLS');
select ok(has_table_privilege('authenticated', 'public.goals', 'select'), 'authenticated can read their goals through RLS');
select ok(has_table_privilege('authenticated', 'public.action_plans', 'select'), 'authenticated can read their action plans through RLS');
select ok(has_table_privilege('authenticated', 'public.check_ins', 'select'), 'authenticated can read their check-ins through RLS');
select ok(has_table_privilege('authenticated', 'public.action_plans', 'insert'), 'authenticated can create a scheduled action plan through RLS');
select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anon cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.stores', 'insert'), 'clients cannot create stores directly');
select ok(not has_table_privilege('authenticated', 'public.consent_events', 'insert'), 'clients cannot create consent events directly');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'clients cannot alter email or access status');
select ok(not has_table_privilege('authenticated', 'public.action_plans', 'update'), 'clients cannot complete an action plan directly');
select ok(not has_table_privilege('authenticated', 'public.check_ins', 'insert'), 'clients cannot insert a check-in directly');
select ok(not has_table_privilege('authenticated', 'public.coaching_sessions', 'insert'), 'clients cannot create coaching sessions directly');
select ok(not has_table_privilege('anon', 'public.assessments', 'insert'), 'anon cannot insert assessments directly');
select ok(not has_table_privilege('anon', 'public.goals', 'insert'), 'anon cannot insert goals directly');
select ok(not has_table_privilege('authenticated', 'public.assessments', 'insert'), 'authenticated users cannot insert assessments directly');
select ok(not has_table_privilege('authenticated', 'public.assessments', 'update'), 'authenticated users cannot update assessments directly');
select ok(not has_table_privilege('authenticated', 'public.assessments', 'delete'), 'authenticated users cannot delete assessments directly');
select ok(not has_table_privilege('authenticated', 'public.goals', 'insert'), 'authenticated users cannot insert goals directly');
select ok(not has_table_privilege('authenticated', 'public.goals', 'update'), 'authenticated users cannot update goals directly');
select ok(not has_table_privilege('authenticated', 'public.goals', 'delete'), 'authenticated users cannot delete goals directly');
select ok(not has_function_privilege('authenticated', 'public.finalize_buyer_registration(uuid, text)', 'execute'), 'only server can finalize registration');
select ok(not has_function_privilege('authenticated', 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)', 'execute'), 'only server can reserve an invite');
select ok(not has_function_privilege('authenticated', 'public.cleanup_expired_buyer_registrations()', 'execute'), 'only server can clean expired PII');
select ok(not has_function_privilege('authenticated', 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)', 'execute'), 'only the server activates an anonymous reader');
select ok(not has_function_privilege('authenticated', 'public.consume_coaching_request(uuid)', 'execute'), 'clients cannot consume coaching requests directly');
select ok(has_function_privilege('service_role', 'public.consume_coaching_request(uuid)', 'execute'), 'only the server can consume coaching requests');
select ok(
  not has_function_privilege('authenticated', 'public.record_admin_login_failure(text)', 'execute'),
  'authenticated users cannot record admin login failures'
);
select ok(
  has_function_privilege('service_role', 'public.record_admin_login_failure(text)', 'execute'),
  'service role can record admin login failures'
);
select ok(has_function_privilege('authenticated', 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)', 'execute'), 'active authenticated buyers can save an assessment through the RPC');
select is((select prosecdef from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), true, 'finalizer is security definer');
select is((select prosecdef from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), true, 'reservation is security definer');
select is((select prosecdef from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), true, 'anonymous activation is security definer');
select is((select prosecdef from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), true, 'action completion is security definer');
select is((select prosecdef from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), true, 'assessment save is security definer');
select is((select prosecdef from pg_proc where oid = 'public.consume_coaching_request(uuid)'::regprocedure), true, 'coaching rate limiter is security definer');
select alike((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), '%search_path=public%', 'finalizer pins search path');
select alike((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), '%search_path=public%', 'anonymous activation pins search path');
select alike((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), '%search_path=public%', 'action completion pins search path');
select alike((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), '%search_path=public%', 'assessment save pins search path');
select alike((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.consume_coaching_request(uuid)'::regprocedure), '%search_path=public%', 'coaching rate limiter pins search path');
select alike((select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), '%for update%', 'reservation locks its rows atomically');
select alike((select prosrc from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), '%for update%', 'action completion locks its plan atomically');
select alike((select prosrc from pg_proc where oid = 'public.complete_action_plan(uuid, text, text, text)'::regprocedure), '%v_action.status = ''completed''%', 'action completion returns the existing result when retried');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'check_ins_action_plan_user_unique_idx'), 'a check-in is unique per completed action plan');
select alike((select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), '%v_invite.code_hash = p_code_hash%', 'an idempotent pending reservation requires the same code hash');
select alike((select prosrc from pg_proc where oid = 'public.consume_invite_attempt(text)'::regprocedure), '%pg_advisory_xact_lock%', 'rate limiting locks each IP rolling window atomically');
select alike((select prosrc from pg_proc where oid = 'public.consume_coaching_request(uuid)'::regprocedure), '%pg_advisory_xact_lock%', 'coaching rate limiting locks each user rolling window atomically');
set local role service_role;
select ok(public.record_admin_login_failure(repeat('a', 64)), 'first failure remains below the lock threshold');
select ok(public.record_admin_login_failure(repeat('a', 64)), 'second failure remains below the lock threshold');
select ok(public.record_admin_login_failure(repeat('a', 64)), 'third failure remains below the lock threshold');
select ok(public.record_admin_login_failure(repeat('a', 64)), 'fourth failure remains below the lock threshold');
select ok(not public.record_admin_login_failure(repeat('a', 64)), 'fifth failure atomically reaches the lock threshold');
select ok(not public.check_admin_login_attempt(repeat('a', 64)), 'a locked hash cannot log in');
select lives_ok(
  $$select public.clear_admin_login_failures(repeat('a', 64))$$,
  'a successful login can clear failures'
);
select ok(public.check_admin_login_attempt(repeat('a', 64)), 'clearing failures restores access');
select ok(not public.check_admin_login_attempt(null), 'a null hash cannot log in');
select throws_ok(
  $$select public.record_admin_login_failure(null)$$,
  'P0001', 'invalid_ip_hash',
  'a null hash cannot record a failure'
);
reset role;
select alike((select prosrc from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), '%access_status = ''active''%', 'assessment RPC rejects inactive users');
select alike((select prosrc from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, jsonb, date, date)'::regprocedure), '%p_allocation%', 'assessment RPC validates the saved allocation');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assessments' and policyname = 'assessment_owner_insert'), 'direct assessment INSERT policy is removed');
select ok(exists (select 1 from pg_extension where extname = 'pg_cron'), 'pg_cron is installed for scheduled cleanup');
select ok(exists (select 1 from cron.job where jobname = 'cleanup-expired-buyer-registrations'), 'expired registration cleanup is scheduled');
select alike(obj_description('public.cleanup_expired_buyer_registrations()'::regprocedure, 'pg_proc'), '%35 minutes%', 'cleanup retention contract includes the cron delay');
select alike(obj_description('public.finalize_buyer_registration(uuid, text)'::regprocedure, 'pg_proc'), '%explicit user confirmation%', 'finalization contract prohibits automatic callback completion');
select alike((select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), '%v_invite.is_reusable%', 'registration supports reusable access codes');
select alike((select prosrc from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), '%if not v_invite.is_reusable then%', 'finalization does not redeem reusable access codes');
select ok(not exists (
  select 1 from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (email)'
), 'lead email is not an authentication key');
select alike((select prosrc from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), '%is_anonymous%', 'activation requires an anonymous auth user');
select alike((select prosrc from pg_proc where oid = 'public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean)'::regprocedure), '%if not v_invite.is_reusable then%', 'activation consumes only single-use codes');
select is((select count(*) from public.invite_codes where is_reusable and code_hash = encode(extensions.digest('DOITNOW', 'sha256'), 'hex')), 1::bigint, 'DOITNOW is seeded once as a reusable normalized hash');
select ok(
  public.reserve_buyer_registration(encode(extensions.digest('DOITNOW', 'sha256'), 'hex'), 'reader-one@example.test', 'reader one', 'seoul', 'store one', true, false),
  'the reusable code accepts the first reader'
);
select ok(
  public.reserve_buyer_registration(encode(extensions.digest('DOITNOW', 'sha256'), 'hex'), 'reader-two@example.test', 'reader two', 'busan', 'store two', true, false),
  'the reusable code accepts a second reader'
);
select is(
  (select status from public.invite_codes where is_reusable and code_hash = encode(extensions.digest('DOITNOW', 'sha256'), 'hex')),
  'available',
  'the reusable code remains available after multiple reservations'
);

insert into auth.users (id, is_anonymous)
values
  ('88888888-8888-8888-8888-888888888888', true),
  ('99999999-9999-9999-9999-999999999999', true);
select public.activate_anonymous_reader('88888888-8888-8888-8888-888888888888', encode(extensions.digest('DOITNOW', 'sha256'), 'hex'), 'reader one', 'shared@example.test', 'seoul', 'store one', true, false);
select public.activate_anonymous_reader('99999999-9999-9999-9999-999999999999', encode(extensions.digest('DOITNOW', 'sha256'), 'hex'), 'reader two', 'shared@example.test', 'busan', 'store two', true, false);
select is((select count(*) from public.profiles where email = 'shared@example.test'), 2::bigint, 'duplicate lead emails remain isolated by auth user id');

insert into public.invite_attempts (ip_hash, attempted_at)
select repeat('a', 64), now() - interval '14 minutes 59 seconds'
from generate_series(1, 5);
select is(public.consume_invite_attempt(repeat('a', 64)), false, 'a sixth request inside the rolling 15-minute window is rejected');
update public.invite_attempts
set attempted_at = now() - interval '15 minutes 1 second'
where ip_hash = repeat('a', 64);
select is(public.consume_invite_attempt(repeat('a', 64)), true, 'a request immediately after the rolling window is accepted');

insert into auth.users (id, email, email_confirmed_at)
values
  ('33333333-3333-3333-3333-333333333333', 'suspended@example.test', now()),
  ('44444444-4444-4444-4444-444444444444', 'active@example.test', now());
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

insert into public.coaching_sessions (
  id, user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, context
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666',
  'not_visible',
  'How can I become more visible?',
  'discovery',
  0.9,
  '{}'::jsonb
);

select is(
  (select count(*) from generate_series(1, 20) where public.consume_coaching_request('44444444-4444-4444-4444-444444444444')),
  20::bigint,
  'the first twenty coaching requests inside an hour are accepted'
);
select is(
  public.consume_coaching_request('44444444-4444-4444-4444-444444444444'),
  false,
  'the twenty-first coaching request inside an hour is rejected'
);

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
set local role authenticated;
select is_empty(
  $$select id from public.coaching_sessions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'an active user cannot select another user''s coaching session'
);
select throws_ok(
  $$insert into public.coaching_sessions (user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, context)
    values ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'not_visible', 'direct write', 'discovery', 0.9, '{}'::jsonb)$$,
  '42501', null,
  'an authenticated user cannot insert a coaching session directly'
);
reset role;

select throws_ok(
  $$insert into public.coaching_sessions (user_id, store_id, assessment_id, concern_key, initial_question, intent, confidence, follow_up_count, context)
    values ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'not_visible', 'too many follow ups', 'discovery', 0.9, 3, '{}'::jsonb)$$,
  '23514', null,
  'a coaching session cannot store more than two follow ups'
);
select throws_ok(
  $$insert into public.coaching_recommendations (user_id, session_id, action_key, action_version, evidence_keys, metric_snapshot, feedback)
    values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'improve_listing', 1, '[]'::jsonb, '{}'::jsonb, 'invalid')$$,
  '23514', null,
  'a coaching recommendation feedback value must be from the approved set'
);

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
select throws_ok(
  $$insert into public.assessments (user_id, store_id, input_data, calculated_metrics, diagnosis) values ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '42501', null,
  'an active authenticated user cannot insert an assessment directly'
);
select throws_ok(
  $$insert into public.goals (user_id, store_id, assessment_id, target_revenue, allocation, period_start, period_end) values ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 40000000, '{}'::jsonb, current_date, current_date)$$,
  '42501', null,
  'an active authenticated user cannot insert a goal directly'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, null::numeric, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects SQL NULL target revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, -1, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects negative target revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 0, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects zero target revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 'NaN'::numeric, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects NaN target revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 'Infinity'::numeric, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects positive infinity target revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, '-Infinity'::numeric, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects negative infinity target revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, null::jsonb, '{}'::jsonb, 40000000, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects SQL NULL calculated metrics'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 40000000, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects missing shortfall revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, 'null'::jsonb, '{}'::jsonb, 40000000, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects JSON null calculated metrics'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": null}'::jsonb, '{}'::jsonb, 40000000, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects a JSON null shortfall revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": "10000000"}'::jsonb, '{}'::jsonb, 40000000, '{}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects a non-number shortfall revenue'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 40000000, null::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects SQL NULL allocation'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 40000000, 'null'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects JSON null allocation'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 40000000, '{"newCustomerRevenue": null, "returningCustomerRevenue": 0, "averageOrderValueRevenue": 0}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects an allocation with a null value'
);
select throws_ok(
  $$select public.save_assessment_with_goal('55555555-5555-5555-5555-555555555555', '{}'::jsonb, '{"shortfallRevenue": 0}'::jsonb, '{}'::jsonb, 40000000, '{"newCustomerRevenue": 0, "returningCustomerRevenue": 0}'::jsonb, current_date, current_date)$$,
  'P0001', 'invalid_goal_allocation',
  'the assessment RPC rejects an allocation with a missing key'
);
do $$
begin
  perform set_config(
    'test.saved_goal_id',
    public.save_assessment_with_goal(
      '55555555-5555-5555-5555-555555555555',
      '{}'::jsonb,
      '{"shortfallRevenue": 10000000}'::jsonb,
      '{}'::jsonb,
      40000000,
      '{"newCustomerRevenue": 6000000, "returningCustomerRevenue": 2000000, "averageOrderValueRevenue": 2000000}'::jsonb,
      current_date,
      current_date
    )::text,
    true
  );
end;
$$;
select ok(
  (
    select allocation = '{"newCustomerRevenue": 6000000, "returningCustomerRevenue": 2000000, "averageOrderValueRevenue": 2000000}'::jsonb
    from public.goals
    where id = current_setting('test.saved_goal_id')::uuid
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
select is(
  public.finalize_buyer_registration(
    '44444444-4444-4444-4444-444444444444',
    'active@example.test'
  ),
  '55555555-5555-5555-5555-555555555555'::uuid,
  'finalization returns the existing store when retried after completion'
);
set local role authenticated;
select throws_ok(
  $$insert into public.action_plans (user_id, store_id, assessment_id, action_key, action_snapshot, status)
    values ('44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'tamper', '{}'::jsonb, 'completed')$$,
  '42501', null,
  'an authenticated user cannot create a completed action plan directly'
);
reset role;

select * from finish();

rollback;
