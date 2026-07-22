grant usage on schema public to authenticated;

grant select on table public.profiles, public.consent_events, public.stores, public.assessments, public.goals, public.action_plans, public.check_ins to authenticated;

grant insert on table public.action_plans to authenticated;
