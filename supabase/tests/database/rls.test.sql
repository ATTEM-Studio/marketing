begin;

select plan(32);

select has_table('public', 'profiles');
select has_table('public', 'invite_codes');
select has_table('public', 'pending_registrations');
select has_table('public', 'assessments');
select has_function('public', 'finalize_buyer_registration', array['uuid', 'text']);
select has_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'date', 'date']);
select has_function('public', 'reserve_buyer_registration', array['text', 'text', 'text', 'text', 'text', 'boolean', 'boolean']);
select has_function('public', 'consume_invite_attempt', array['text']);
select has_function('public', 'cleanup_expired_buyer_registrations', array[]::text[]);
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
select ok(not has_function_privilege('authenticated', 'public.finalize_buyer_registration(uuid, text)', 'execute'), 'only server can finalize registration');
select ok(not has_function_privilege('authenticated', 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)', 'execute'), 'only server can reserve an invite');
select ok(not has_function_privilege('authenticated', 'public.cleanup_expired_buyer_registrations()', 'execute'), 'only server can clean expired PII');
select is((select prosecdef from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), true, 'finalizer is security definer');
select is((select prosecdef from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), true, 'reservation is security definer');
select like((select array_to_string(proconfig, ',') from pg_proc where oid = 'public.finalize_buyer_registration(uuid, text)'::regprocedure), '%search_path=public%', 'finalizer pins search path');
select like((select prosrc from pg_proc where oid = 'public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean)'::regprocedure), '%for update%', 'reservation locks its rows atomically');
select like((select prosrc from pg_proc where oid = 'public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, date, date)'::regprocedure), '%access_status = ''active''%', 'assessment RPC rejects inactive users');
select like((select qual from pg_policies where schemaname = 'public' and tablename = 'assessments' and policyname = 'assessment_owner_insert'), '%access_status = ''active''%', 'assessment RLS requires an active profile');

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
  $$select public.save_assessment_with_goal('22222222-2222-2222-2222-222222222222', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0, current_date, current_date)$$,
  'P0001', 'store_not_found',
  'the assessment RPC rejects a user without an active profile'
);
reset role;

select * from finish();

rollback;
