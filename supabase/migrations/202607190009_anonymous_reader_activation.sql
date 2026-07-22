alter table public.profiles
  drop constraint profiles_email_key;

create or replace function public.activate_anonymous_reader(
  p_user_id uuid,
  p_code_hash text,
  p_name text,
  p_email text,
  p_region text,
  p_business_name text,
  p_required_consent boolean,
  p_marketing_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_invite public.invite_codes%rowtype;
  v_store_id uuid;
  v_is_anonymous boolean;
begin
  if char_length(p_code_hash) <> 64
    or char_length(trim(p_name)) not between 1 and 100
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or char_length(v_email) > 320
    or char_length(trim(p_region)) not between 1 and 100
    or char_length(trim(p_business_name)) not between 1 and 160
    or p_required_consent is not true
    or p_marketing_consent is null then
    raise exception 'invalid_registration' using errcode = 'P0001';
  end if;

  select is_anonymous into v_is_anonymous
  from auth.users
  where id = p_user_id
  for key share;

  if not found or v_is_anonymous is not true then
    raise exception 'anonymous_user_required' using errcode = 'P0001';
  end if;

  select s.id into v_store_id
  from public.profiles p
  join public.stores s on s.user_id = p.id
  where p.id = p_user_id
    and p.access_status = 'active';

  if found then
    return v_store_id;
  end if;

  select * into v_invite
  from public.invite_codes
  where code_hash = p_code_hash
  for update;

  if not found
    or v_invite.expires_at <= now()
    or v_invite.status <> 'available' then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, name, email, region, business_name, access_status)
  values (
    p_user_id,
    trim(p_name),
    v_email,
    trim(p_region),
    trim(p_business_name),
    'active'
  );

  insert into public.stores (user_id, name, region)
  values (p_user_id, trim(p_business_name), trim(p_region))
  returning id into v_store_id;

  insert into public.consent_events (user_id, consent_type, granted)
  values
    (p_user_id, 'service_terms', true),
    (p_user_id, 'marketing', p_marketing_consent);

  if not v_invite.is_reusable then
    update public.invite_codes
    set status = 'redeemed',
        redeemed_by = p_user_id,
        redeemed_at = now()
    where id = v_invite.id;
  end if;

  return v_store_id;
end;
$$;

comment on function public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean) is
  'Server-only activation for same-browser anonymous readers. Submitted email is unverified lead data and never authorizes access.';

revoke all on function public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.activate_anonymous_reader(uuid, text, text, text, text, text, boolean, boolean) to service_role;
