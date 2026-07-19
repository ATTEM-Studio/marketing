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
  reserved_email text,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (
    (status = 'available' and reserved_email is null and reserved_at is null and reservation_expires_at is null and redeemed_by is null and redeemed_at is null)
    or (status = 'reserved' and reserved_email is not null and reserved_at is not null and reservation_expires_at is not null and reservation_expires_at <= expires_at and redeemed_by is null and redeemed_at is null)
    or (status = 'redeemed' and reserved_email is null and reserved_at is null and reservation_expires_at is null and redeemed_by is not null and redeemed_at is not null)
    or (status = 'expired' and reserved_email is null and reserved_at is null and reservation_expires_at is null)
  )
);

create unique index invite_codes_active_reservation_email_idx
  on public.invite_codes (reserved_email)
  where status = 'reserved';

create table public.invite_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null check (char_length(ip_hash) = 64),
  window_started_at timestamptz not null,
  attempt_count integer not null default 1 check (attempt_count between 1 and 5),
  updated_at timestamptz not null default now(),
  unique (ip_hash, window_started_at)
);

create index invite_attempts_ip_hash_window_idx on public.invite_attempts (ip_hash, window_started_at desc);

create table public.pending_registrations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email))),
  name text not null check (char_length(trim(name)) between 1 and 100),
  region text not null check (char_length(trim(region)) between 1 and 100),
  business_name text not null check (char_length(trim(business_name)) between 1 and 160),
  required_consent boolean not null check (required_consent),
  marketing_consent boolean not null default false,
  invite_code_id uuid not null unique references public.invite_codes(id) on delete restrict,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
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

alter table public.stores add unique (id, user_id);

create index stores_user_id_idx on public.stores (user_id);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null,
  input_version text not null default 'v1',
  input_data jsonb not null check (jsonb_typeof(input_data) = 'object'),
  calculated_metrics jsonb not null check (jsonb_typeof(calculated_metrics) = 'object'),
  diagnosis jsonb not null check (jsonb_typeof(diagnosis) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.assessments add unique (id, user_id);
alter table public.assessments
  add constraint assessments_store_owner_fkey
  foreign key (store_id, user_id) references public.stores(id, user_id) on delete cascade;

create index assessments_user_id_idx on public.assessments (user_id);
create index assessments_store_id_idx on public.assessments (store_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null,
  assessment_id uuid not null,
  target_revenue numeric not null check (target_revenue >= 0),
  allocation jsonb not null default '{}'::jsonb check (jsonb_typeof(allocation) = 'object'),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  created_at timestamptz not null default now()
);

alter table public.goals
  add constraint goals_store_owner_fkey
  foreign key (store_id, user_id) references public.stores(id, user_id) on delete cascade;
alter table public.goals
  add constraint goals_assessment_owner_fkey
  foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade;

create index goals_user_id_idx on public.goals (user_id);

create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null,
  assessment_id uuid not null,
  action_key text not null check (char_length(trim(action_key)) between 1 and 120),
  action_snapshot jsonb not null check (jsonb_typeof(action_snapshot) = 'object'),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'skipped')),
  scheduled_for date,
  check_in_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.action_plans add unique (id, user_id);
alter table public.action_plans
  add constraint action_plans_store_owner_fkey
  foreign key (store_id, user_id) references public.stores(id, user_id) on delete cascade;
alter table public.action_plans
  add constraint action_plans_assessment_owner_fkey
  foreign key (assessment_id, user_id) references public.assessments(id, user_id) on delete cascade;

create index action_plans_user_id_idx on public.action_plans (user_id);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_plan_id uuid not null,
  before_value numeric,
  after_value numeric,
  note text check (char_length(note) <= 2000),
  recorded_at timestamptz not null default now()
);

alter table public.check_ins
  add constraint check_ins_action_owner_fkey
  foreign key (action_plan_id, user_id) references public.action_plans(id, user_id) on delete cascade;

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
revoke insert, update, delete on table public.profiles, public.stores, public.consent_events from anon, authenticated;

create policy profile_owner_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy consent_owner_select on public.consent_events for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy store_owner_select on public.stores for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy assessment_owner_select on public.assessments for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy assessment_owner_insert on public.assessments for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy goal_owner_select on public.goals for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy goal_owner_insert on public.goals for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy action_owner_select on public.action_plans for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy action_owner_insert on public.action_plans for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy action_owner_update on public.action_plans for update to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
) with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy checkin_owner_select on public.check_ins for select to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy checkin_owner_insert on public.check_ins for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
create policy checkin_owner_update on public.check_ins for update to authenticated using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
) with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);

create or replace function public.consume_invite_attempt(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / 900) * 900);
  v_attempt_count integer;
begin
  if char_length(p_ip_hash) <> 64 then
    return false;
  end if;

  insert into public.invite_attempts (ip_hash, window_started_at)
  values (p_ip_hash, v_window)
  on conflict (ip_hash, window_started_at) do update
    set attempt_count = public.invite_attempts.attempt_count + 1,
        updated_at = now()
    where public.invite_attempts.attempt_count < 5
  returning attempt_count into v_attempt_count;

  return found and v_attempt_count <= 5;
end;
$$;

create or replace function public.cleanup_expired_buyer_registrations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released integer;
begin
  delete from public.pending_registrations
  where expires_at <= now();

  with released as (
    update public.invite_codes
    set status = case when expires_at <= now() then 'expired' else 'available' end,
        reserved_email = null,
        reserved_at = null,
        reservation_expires_at = null
    where status = 'reserved'
      and (expires_at <= now() or reservation_expires_at <= now())
    returning id
  )
  select count(*) into v_released from released;

  return v_released;
end;
$$;

create or replace function public.reserve_buyer_registration(
  p_code_hash text,
  p_email text,
  p_name text,
  p_region text,
  p_business_name text,
  p_required_consent boolean,
  p_marketing_consent boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_pending public.pending_registrations%rowtype;
  v_invite public.invite_codes%rowtype;
  v_reservation_expires_at timestamptz;
begin
  if char_length(p_code_hash) <> 64
    or v_email = ''
    or p_required_consent is not true
    or p_marketing_consent is null then
    return false;
  end if;

  perform public.cleanup_expired_buyer_registrations();

  select * into v_pending
  from public.pending_registrations
  where email = v_email
  for update;

  if found then
    select * into v_invite
    from public.invite_codes
    where id = v_pending.invite_code_id
    for update;

    if found
      and v_invite.status = 'reserved'
      and v_invite.reserved_email = v_email
      and v_invite.expires_at > now()
      and v_invite.reservation_expires_at > now()
      and v_pending.expires_at > now() then
      return true;
    end if;

    delete from public.pending_registrations where id = v_pending.id;
  end if;

  select * into v_invite
  from public.invite_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    return false;
  end if;

  if v_invite.expires_at <= now() then
    update public.invite_codes
    set status = 'expired', reserved_email = null, reserved_at = null, reservation_expires_at = null
    where id = v_invite.id and status <> 'redeemed';
    return false;
  end if;

  if v_invite.status = 'reserved' then
    if v_invite.reserved_email = v_email
      and v_invite.reservation_expires_at > now() then
      insert into public.pending_registrations (
        email, name, region, business_name, required_consent, marketing_consent, invite_code_id, expires_at
      ) values (
        v_email, p_name, p_region, p_business_name, true, p_marketing_consent, v_invite.id, v_invite.reservation_expires_at
      ) on conflict (email) do nothing;
      return true;
    end if;
    return false;
  end if;

  if v_invite.status <> 'available' then
    return false;
  end if;

  v_reservation_expires_at := least(v_invite.expires_at, now() + interval '30 minutes');
  update public.invite_codes
  set status = 'reserved',
      reserved_email = v_email,
      reserved_at = now(),
      reservation_expires_at = v_reservation_expires_at
  where id = v_invite.id;

  insert into public.pending_registrations (
    email, name, region, business_name, required_consent, marketing_consent, invite_code_id, expires_at
  ) values (
    v_email, p_name, p_region, p_business_name, true, p_marketing_consent, v_invite.id, v_reservation_expires_at
  );

  return true;
end;
$$;

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
  v_auth_email text;
  v_email_confirmed_at timestamptz;
begin
  select lower(email), email_confirmed_at into v_auth_email, v_email_confirmed_at
  from auth.users
  where id = p_user_id
  for key share;

  if not found or v_auth_email is distinct from v_email or v_email_confirmed_at is null then
    raise exception 'registration_not_ready' using errcode = 'P0001';
  end if;

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
    or v_invite.reservation_expires_at <= now()
    or v_pending.expires_at <= now()
    or v_invite.reserved_email <> v_email then
    raise exception 'registration_not_ready' using errcode = 'P0001';
  end if;

  update public.pending_registrations
  set confirmed_at = now(), updated_at = now()
  where id = v_pending.id and confirmed_at is null;

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
  set status = 'redeemed',
      reserved_email = null,
      reserved_at = null,
      reservation_expires_at = null,
      redeemed_by = p_user_id,
      redeemed_at = now()
  where id = v_invite.id;

  delete from public.pending_registrations where id = v_pending.id;

  return v_store_id;
end;
$$;

revoke all on function public.finalize_buyer_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_buyer_registration(uuid, text) to service_role;
revoke all on function public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean) to service_role;
revoke all on function public.consume_invite_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_invite_attempt(text) to service_role;
revoke all on function public.cleanup_expired_buyer_registrations() from public, anon, authenticated;
grant execute on function public.cleanup_expired_buyer_registrations() to service_role;

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
      select 1 from public.profiles
      where id = v_user_id and access_status = 'active'
    )
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
