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

  -- already finalized: a repeated confirmation returns the existing store safely.
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

comment on function public.finalize_buyer_registration(uuid, text) is
  'Server-only atomic finalization. Repeated explicit confirmation returns the existing store; auth callbacks never finalize registration automatically.';

revoke all on function public.finalize_buyer_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_buyer_registration(uuid, text) to service_role;

drop policy if exists action_owner_insert on public.action_plans;
create policy action_owner_insert on public.action_plans for insert to authenticated with check (
  (select auth.uid()) = user_id
  and status = 'scheduled'
  and exists (select 1 from public.profiles where id = (select auth.uid()) and access_status = 'active')
);
