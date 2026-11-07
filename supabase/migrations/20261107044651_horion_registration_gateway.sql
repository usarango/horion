begin;
-- Server-only primitives for Horion registration. No Auth setting, Auth hook,
-- identity, profile, role grant or Rango object is created or changed here.
create table horion_private.registration_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check(ip_hash ~ '^[0-9a-f]{64}$'),
  email_hash text not null check(email_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);
alter table horion_private.registration_attempts enable row level security;
revoke all on horion_private.registration_attempts from public,anon,authenticated,service_role;
revoke all on sequence horion_private.registration_attempts_id_seq from public,anon,authenticated,service_role;
create index registration_attempts_created_idx on horion_private.registration_attempts(created_at);
create index registration_attempts_ip_created_idx on horion_private.registration_attempts(ip_hash,created_at);
create index registration_attempts_email_created_idx on horion_private.registration_attempts(email_hash,created_at);
comment on table horion_private.registration_attempts is 'Server-only registration throttle. Values are scoped keyed HMAC digests, not raw IP addresses/emails. Accepted attempts count before Auth, including failed password or duplicate requests. Retained at most 24 hours on the next attempt.';

create function horion_private.consume_registration_attempt(p_ip_hash text,p_email_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare request_time timestamptz;
begin
  if p_ip_hash is null or p_email_hash is null or
    p_ip_hash !~ '^[0-9a-f]{64}$' or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid registration digest' using errcode='22023';
  end if;
  -- A single lock keeps all three limits atomic, including different IP/email
  -- pairs competing for the global allowance. There is no caller-supplied time.
  perform pg_advisory_xact_lock(hashtextextended('horion-registration:v1',0));
  request_time:=clock_timestamp();
  delete from horion_private.registration_attempts
    where created_at<request_time-interval '24 hours';
  if (select count(*) from horion_private.registration_attempts where created_at>request_time-interval '1 hour')>=100 or
     (select count(*) from horion_private.registration_attempts where ip_hash=p_ip_hash and created_at>request_time-interval '1 hour')>=20 or
     (select count(*) from horion_private.registration_attempts where ip_hash=p_ip_hash and created_at>request_time-interval '1 minute')>=5 or
     (select count(*) from horion_private.registration_attempts where email_hash=p_email_hash and created_at>request_time-interval '1 hour')>=5 then
    return false;
  end if;
  insert into horion_private.registration_attempts(ip_hash,email_hash,created_at)
    values(p_ip_hash,p_email_hash,request_time);
  return true;
end;
$$;
revoke all on function horion_private.consume_registration_attempt(text,text) from public,anon,authenticated,service_role;
grant usage on schema horion,horion_private to service_role;
grant execute on function horion_private.consume_registration_attempt(text,text) to service_role;
create function horion.consume_registration_attempt(p_ip_hash text,p_email_hash text)
returns boolean language sql security invoker set search_path='' as $$
  select horion_private.consume_registration_attempt(p_ip_hash,p_email_hash);
$$;
revoke all on function horion.consume_registration_attempt(text,text) from public,anon,authenticated,service_role;
grant execute on function horion.consume_registration_attempt(text,text) to service_role;

-- This lookup performs no confirmation and returns no password or metadata.
-- The trusted Edge Function may call it ONLY after the normal Auth password
-- endpoint returns email_not_confirmed, which follows password validation in
-- the project's GoTrue version. An email alone never authorizes confirmation.
create function horion_private.resolve_pending_registration(p_email text)
returns uuid language plpgsql security definer set search_path='' as $$
declare normalized_email text:=lower(btrim(p_email)); matches uuid[];
begin
  if normalized_email is null or char_length(normalized_email)>254 or
    normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid registration email' using errcode='22023';
  end if;
  select array_agg(u.id) into matches from auth.users u
    where lower(u.email)=normalized_email and u.email_confirmed_at is null
      and u.deleted_at is null and not coalesce(u.is_sso_user,false)
      and not coalesce(u.is_anonymous,false) and coalesce(u.encrypted_password,'')<>''
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='email');
  if array_length(matches,1)=1 then return matches[1]; end if;
  return null;
end;
$$;
revoke all on function horion_private.resolve_pending_registration(text) from public,anon,authenticated,service_role;
grant execute on function horion_private.resolve_pending_registration(text) to service_role;
create function horion.resolve_pending_registration(p_email text)
returns uuid language sql security invoker set search_path='' as $$
  select horion_private.resolve_pending_registration(p_email);
$$;
revoke all on function horion.resolve_pending_registration(text) from public,anon,authenticated,service_role;
grant execute on function horion.resolve_pending_registration(text) to service_role;
commit;
