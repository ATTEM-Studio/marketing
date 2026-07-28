create table public.admin_login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  attempted_at timestamptz not null default now()
);

create index admin_login_attempts_ip_hash_attempted_at_idx
  on public.admin_login_attempts (ip_hash, attempted_at desc);

alter table public.admin_login_attempts enable row level security;
revoke all on table public.admin_login_attempts from public, anon, authenticated;
grant select, insert, delete on table public.admin_login_attempts to service_role;

create or replace function public.check_admin_login_attempt(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_failures integer;
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 0));
  delete from public.admin_login_attempts
    where attempted_at < now() - interval '15 minutes';
  select count(*) into v_failures from public.admin_login_attempts
    where ip_hash = p_ip_hash and attempted_at >= now() - interval '15 minutes';
  return v_failures < 5;
end;
$$;

create or replace function public.record_admin_login_failure(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_failures integer;
begin
  if p_ip_hash is null or char_length(p_ip_hash) <> 64 then
    raise exception 'invalid_ip_hash';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_ip_hash, 0));
  delete from public.admin_login_attempts
    where attempted_at < now() - interval '15 minutes';
  select count(*) into v_failures from public.admin_login_attempts
    where ip_hash = p_ip_hash and attempted_at >= now() - interval '15 minutes';
  if v_failures >= 5 then return false; end if;
  insert into public.admin_login_attempts (ip_hash) values (p_ip_hash);
  return v_failures + 1 < 5;
end;
$$;

create or replace function public.clear_admin_login_failures(p_ip_hash text)
returns void language sql security definer set search_path = public
as $$
  delete from public.admin_login_attempts where ip_hash = p_ip_hash;
$$;

revoke all on function public.check_admin_login_attempt(text) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text) from public, anon, authenticated;
revoke all on function public.clear_admin_login_failures(text) from public, anon, authenticated;
grant execute on function public.check_admin_login_attempt(text) to service_role;
grant execute on function public.record_admin_login_failure(text) to service_role;
grant execute on function public.clear_admin_login_failures(text) to service_role;
