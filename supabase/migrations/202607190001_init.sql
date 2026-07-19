create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  email text not null unique check (email = lower(trim(email))),
  region text not null check (char_length(trim(region)) between 1 and 100),
  business_name text not null check (char_length(trim(business_name)) between 1 and 160),
  access_status text not null default 'active' check (access_status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (char_length(code_hash) = 64),
  status text not null default 'available' check (status in ('available', 'reserved', 'redeemed', 'expired')),
  reserved_email text unique,
  reserved_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (
    (status = 'available' and reserved_email is null and reserved_at is null and redeemed_by is null and redeemed_at is null)
    or (status = 'reserved' and reserved_email is not null and reserved_at is not null and redeemed_by is null and redeemed_at is null)
    or (status = 'redeemed' and reserved_email is not null and redeemed_by is not null and redeemed_at is not null)
    or status = 'expired'
  )
);

create table public.invite_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null check (char_length(ip_hash) = 64),
  attempted_at timestamptz not null default now()
);

create index invite_attempts_ip_hash_attempted_at_idx on public.invite_attempts (ip_hash, attempted_at desc);

create table public.pending_registrations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email))),
  name text not null check (char_length(trim(name)) between 1 and 100),
  region text not null check (char_length(trim(region)) between 1 and 100),
  business_name text not null check (char_length(trim(business_name)) between 1 and 160),
  required_consent boolean not null check (required_consent),
  marketing_consent boolean not null default false,
  invite_code_id uuid not null unique references public.invite_codes(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in ('service_terms', 'marketing')),
  granted boolean not null,
  policy_version text not null default '2026-07-19',
  recorded_at timestamptz not null default now()
);

create index consent_events_user_id_idx on public.consent_events (user_id);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  region text not null check (char_length(trim(region)) between 1 and 100),
  business_type text not null default 'unspecified' check (char_length(trim(business_type)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stores_user_id_idx on public.stores (user_id);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  input_version text not null default 'v1',
  input_data jsonb not null check (jsonb_typeof(input_data) = 'object'),
  calculated_metrics jsonb not null check (jsonb_typeof(calculated_metrics) = 'object'),
  diagnosis jsonb not null check (jsonb_typeof(diagnosis) = 'object'),
  created_at timestamptz not null default now()
);

create index assessments_user_id_idx on public.assessments (user_id);
create index assessments_store_id_idx on public.assessments (store_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  target_revenue numeric not null check (target_revenue >= 0),
  allocation jsonb not null default '{}'::jsonb check (jsonb_typeof(allocation) = 'object'),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  created_at timestamptz not null default now()
);

create index goals_user_id_idx on public.goals (user_id);

create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  action_key text not null check (char_length(trim(action_key)) between 1 and 120),
  action_snapshot jsonb not null check (jsonb_typeof(action_snapshot) = 'object'),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'skipped')),
  scheduled_for date,
  check_in_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index action_plans_user_id_idx on public.action_plans (user_id);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_plan_id uuid not null references public.action_plans(id) on delete cascade,
  before_value numeric,
  after_value numeric,
  note text check (char_length(note) <= 2000),
  recorded_at timestamptz not null default now()
);

create index check_ins_user_id_idx on public.check_ins (user_id);

alter table public.profiles enable row level security;
alter table public.consent_events enable row level security;
alter table public.invite_codes enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.pending_registrations enable row level security;
alter table public.stores enable row level security;
alter table public.assessments enable row level security;
alter table public.goals enable row level security;
alter table public.action_plans enable row level security;
alter table public.check_ins enable row level security;

revoke all on table public.invite_codes, public.invite_attempts, public.pending_registrations from anon, authenticated;

create policy profile_owner_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profile_owner_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy consent_owner_select on public.consent_events for select to authenticated using ((select auth.uid()) = user_id);
create policy consent_owner_insert on public.consent_events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy store_owner_select on public.stores for select to authenticated using ((select auth.uid()) = user_id);
create policy store_owner_insert on public.stores for insert to authenticated with check ((select auth.uid()) = user_id);
create policy store_owner_update on public.stores for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy assessment_owner_select on public.assessments for select to authenticated using ((select auth.uid()) = user_id);
create policy assessment_owner_insert on public.assessments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy goal_owner_select on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy goal_owner_insert on public.goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy action_owner_select on public.action_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy action_owner_insert on public.action_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy action_owner_update on public.action_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy checkin_owner_select on public.check_ins for select to authenticated using ((select auth.uid()) = user_id);
create policy checkin_owner_insert on public.check_ins for insert to authenticated with check ((select auth.uid()) = user_id);
create policy checkin_owner_update on public.check_ins for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.finalize_buyer_registration(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.pending_registrations%rowtype;
  v_invite public.invite_codes%rowtype;
  v_store_id uuid;
  v_email text := lower(trim(p_email));
begin
  select * into v_pending
  from public.pending_registrations
  where email = v_email
  for update;

  if not found then
    raise exception 'registration_not_ready' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.invite_codes
  where id = v_pending.invite_code_id
  for update;

  if not found
    or v_invite.status <> 'reserved'
    or v_invite.expires_at <= now()
    or v_invite.reserved_email <> v_email then
    raise exception 'registration_not_ready' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, name, email, region, business_name, access_status)
  values (p_user_id, v_pending.name, v_email, v_pending.region, v_pending.business_name, 'active');

  insert into public.stores (user_id, name, region)
  values (p_user_id, v_pending.business_name, v_pending.region)
  returning id into v_store_id;

  insert into public.consent_events (user_id, consent_type, granted)
  values
    (p_user_id, 'service_terms', true),
    (p_user_id, 'marketing', v_pending.marketing_consent);

  update public.invite_codes
  set status = 'redeemed', redeemed_by = p_user_id, redeemed_at = now()
  where id = v_invite.id;

  delete from public.pending_registrations where id = v_pending.id;

  return v_store_id;
end;
$$;

revoke all on function public.finalize_buyer_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_buyer_registration(uuid, text) to service_role;

create or replace function public.save_assessment_with_goal(
  p_store_id uuid,
  p_input_data jsonb,
  p_calculated_metrics jsonb,
  p_diagnosis jsonb,
  p_target_revenue numeric,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_assessment_id uuid;
  v_goal_id uuid;
begin
  if v_user_id is null
    or not exists (
      select 1 from public.stores
      where id = p_store_id and user_id = v_user_id
    ) then
    raise exception 'store_not_found' using errcode = 'P0001';
  end if;

  insert into public.assessments (user_id, store_id, input_data, calculated_metrics, diagnosis)
  values (v_user_id, p_store_id, p_input_data, p_calculated_metrics, p_diagnosis)
  returning id into v_assessment_id;

  insert into public.goals (user_id, store_id, assessment_id, target_revenue, period_start, period_end)
  values (v_user_id, p_store_id, v_assessment_id, p_target_revenue, p_period_start, p_period_end)
  returning id into v_goal_id;

  return v_goal_id;
end;
$$;

revoke all on function public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, date, date) from public, anon;
grant execute on function public.save_assessment_with_goal(uuid, jsonb, jsonb, jsonb, numeric, date, date) to authenticated;
