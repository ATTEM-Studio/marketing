begin;

select plan(9);

select has_table('public', 'profiles');
select has_table('public', 'invite_codes');
select has_table('public', 'pending_registrations');
select has_table('public', 'assessments');
select has_function('public', 'finalize_buyer_registration', array['uuid', 'text']);
select has_function('public', 'save_assessment_with_goal', array['uuid', 'jsonb', 'jsonb', 'jsonb', 'numeric', 'date', 'date']);
select policies_are('public', 'assessments', array['assessment_owner_select', 'assessment_owner_insert']);
select policies_are('public', 'action_plans', array['action_owner_select', 'action_owner_insert', 'action_owner_update']);
select policies_are('public', 'check_ins', array['checkin_owner_select', 'checkin_owner_insert', 'checkin_owner_update']);

select * from finish();

rollback;
