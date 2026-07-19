alter table public.invite_codes
  add column is_reusable boolean not null default false;

alter table public.invite_codes
  drop constraint if exists invite_codes_check;

alter table public.invite_codes
  add constraint invite_codes_state_check check (
    (
      is_reusable
      and status = 'available'
      and reserved_email is null
      and reserved_at is null
      and reservation_expires_at is null
      and redeemed_by is null
      and redeemed_at is null
    )
    or (
      not is_reusable
      and (
        (status = 'available' and reserved_email is null and reserved_at is null and reservation_expires_at is null and redeemed_by is null and redeemed_at is null)
        or (status = 'reserved' and reserved_email is not null and reserved_at is not null and reservation_expires_at is not null and reservation_expires_at <= expires_at and redeemed_by is null and redeemed_at is null)
        or (status = 'redeemed' and reserved_email is null and reserved_at is null and reservation_expires_at is null and redeemed_by is not null and redeemed_at is not null)
        or (status = 'expired' and reserved_email is null and reserved_at is null and reservation_expires_at is null)
      )
    )
  );

alter table public.pending_registrations
  drop constraint pending_registrations_invite_code_id_key;

insert into public.invite_codes (code_hash, status, expires_at, is_reusable)
values (
  encode(digest('DOITNOW', 'sha256'), 'hex'),
  'available',
  '2099-12-31 23:59:59+00',
  true
)
on conflict (code_hash) do update
set status = 'available',
    expires_at = excluded.expires_at,
    is_reusable = true,
    reserved_email = null,
    reserved_at = null,
    reservation_expires_at = null,
    redeemed_by = null,
    redeemed_at = null;

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

    if found and v_invite.is_reusable then
      if v_invite.code_hash = p_code_hash
        and v_invite.status = 'available'
        and v_invite.expires_at > now()
        and v_pending.expires_at > now() then
        return true;
      end if;
      delete from public.pending_registrations where id = v_pending.id;
    elsif found
      and v_invite.status = 'reserved'
      and v_invite.reserved_email = v_email
      and v_invite.expires_at > now()
      and v_invite.reservation_expires_at > now()
      and v_pending.expires_at > now() then
      if v_invite.code_hash = p_code_hash then
        return true;
      end if;
      return false;
    else
      delete from public.pending_registrations where id = v_pending.id;
    end if;
  end if;

  select * into v_invite
  from public.invite_codes
  where code_hash = p_code_hash
  for update;

  if not found then
    return false;
  end if;

  if v_invite.expires_at <= now() then
    if not v_invite.is_reusable then
      update public.invite_codes
      set status = 'expired',
          reserved_email = null,
          reserved_at = null,
          reservation_expires_at = null
      where id = v_invite.id and status <> 'redeemed';
    end if;
    return false;
  end if;

  if v_invite.is_reusable then
    if v_invite.status <> 'available' then
      return false;
    end if;

    v_reservation_expires_at := least(v_invite.expires_at, now() + interval '30 minutes');
    insert into public.pending_registrations (
      email, name, region, business_name, required_consent, marketing_consent, invite_code_id, expires_at
    ) values (
      v_email, p_name, p_region, p_business_name, true, p_marketing_consent, v_invite.id, v_reservation_expires_at
    );
    return true;
  end if;

  if v_invite.status = 'reserved' then
    if v_invite.reserved_email = v_email
      and v_invite.code_hash = p_code_hash
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

  select s.id into v_store_id
  from public.profiles p
  join public.stores s on s.user_id = p.id
  where p.id = p_user_id
    and p.email = v_email
    and p.access_status = 'active';
  if found then
    return v_store_id;
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
    or v_invite.expires_at <= now()
    or v_pending.expires_at <= now()
    or (v_invite.is_reusable and v_invite.status <> 'available')
    or (
      not v_invite.is_reusable
      and (
        v_invite.status <> 'reserved'
        or v_invite.reservation_expires_at <= now()
        or v_invite.reserved_email <> v_email
      )
    ) then
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

  if not v_invite.is_reusable then
    update public.invite_codes
    set status = 'redeemed',
        reserved_email = null,
        reserved_at = null,
        reservation_expires_at = null,
        redeemed_by = p_user_id,
        redeemed_at = now()
    where id = v_invite.id;
  end if;

  delete from public.pending_registrations where id = v_pending.id;

  return v_store_id;
end;
$$;

comment on function public.finalize_buyer_registration(uuid, text) is
  'Server-only atomic finalization. Repeated explicit user confirmation returns the existing store; reusable access codes remain available and auth callbacks never finalize registration automatically.';

revoke all on function public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.reserve_buyer_registration(text, text, text, text, text, boolean, boolean) to service_role;
revoke all on function public.finalize_buyer_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_buyer_registration(uuid, text) to service_role;
