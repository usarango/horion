begin;
-- No identity or profile is created here. A trusted database operator may queue
-- an initial administrator for an existing verified Auth UUID separately.
-- Only Horion objects are created; no trigger is attached to auth.users.
create table horion_private.pending_role_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check(role='admin'),
  created_at timestamptz not null default now()
);
alter table horion_private.pending_role_assignments enable row level security;
revoke all on horion_private.pending_role_assignments from public,anon,authenticated;
comment on table horion_private.pending_role_assignments is 'Operator-only deferred administrator assignment to an existing verified Auth UUID. No email, metadata or account category grants a role.';

create function horion_private.apply_pending_role_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
declare pending_role text;
begin
  -- INSERT policy already limits a browser profile to auth.uid(). This private
  -- trigger consumes only the exact new profile UUID and cannot be called as RPC.
  delete from horion_private.pending_role_assignments where user_id=new.id
    returning role into pending_role;
  if found then
    insert into horion_private.user_roles(user_id,role) values(new.id,pending_role);
    insert into horion_private.audit_log(actor_id,entity,entity_id,operation)
      values((select auth.uid()),'user_roles',new.id::text,'apply_pending:'||pending_role);
  end if;
  return new;
end;
$$;
revoke all on function horion_private.apply_pending_role_assignment() from public,anon,authenticated;
create trigger profile_pending_role after insert on horion.profiles
  for each row execute function horion_private.apply_pending_role_assignment();

-- The administrator UI may grant/revoke the global moderator role. It cannot
-- bootstrap administrators, change an administrator or remove the last one.
create function horion_private.set_member_role(p_user_id uuid,p_role text)
returns text language plpgsql security definer set search_path='' as $$
declare
  actor uuid := (select auth.uid());
  actor_role text;
  previous_role text;
begin
  if actor is null then raise exception 'Administrator required' using errcode='42501'; end if;
  select role into actor_role from horion_private.user_roles where user_id=actor for share;
  if actor_role is distinct from 'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_user_id is null or p_role is null or p_role not in ('member','moderator') then
    raise exception 'Invalid member role' using errcode='22023';
  end if;
  if p_user_id=actor then raise exception 'Self role changes are forbidden' using errcode='42501'; end if;
  -- Lock the profile before checking/changing its role, so a concurrent deletion
  -- or another role operation cannot leave a partial or contradictory grant.
  perform 1 from horion.profiles where id=p_user_id for update;
  if not found then raise exception 'Horion member not found' using errcode='22023'; end if;
  select role into previous_role from horion_private.user_roles where user_id=p_user_id for update;
  if previous_role='admin' then raise exception 'Administrator roles cannot be changed here' using errcode='42501'; end if;
  if coalesce(previous_role,'member')=p_role then return p_role; end if;
  if p_role='member' then
    delete from horion_private.user_roles where user_id=p_user_id;
  else
    insert into horion_private.user_roles(user_id,role) values(p_user_id,'moderator')
      on conflict(user_id) do update set role=excluded.role;
  end if;
  insert into horion_private.audit_log(actor_id,entity,entity_id,operation)
    values(actor,'user_roles',p_user_id::text,'role:'||coalesce(previous_role,'member')||'->'||p_role);
  return p_role;
end;
$$;
revoke all on function horion_private.set_member_role(uuid,text) from public,anon,authenticated;
grant execute on function horion_private.set_member_role(uuid,text) to authenticated;
create function horion.set_member_role(p_user_id uuid,p_role text)
returns text language sql security invoker set search_path='' as $$
  select horion_private.set_member_role(p_user_id,p_role);
$$;
revoke all on function horion.set_member_role(uuid,text) from public,anon,authenticated;
grant execute on function horion.set_member_role(uuid,text) to authenticated;
-- A scoped community moderator can inspect and resolve reports for that
-- community only. The reporter can still inspect their own report.
drop policy report_read on horion.reports;
create policy report_read on horion.reports for select to authenticated using(
  reporter_id=(select auth.uid()) or (select horion_private.is_staff()) or exists(
    select 1 from horion.posts p where p.id=post_id and horion_private.can_moderate(p.community_id)
  )
);
drop policy report_mod_update on horion.reports;
create policy report_mod_update on horion.reports for update to authenticated
  using(exists(select 1 from horion.posts p where p.id=post_id and horion_private.can_moderate(p.community_id)))
  with check(exists(select 1 from horion.posts p where p.id=post_id and horion_private.can_moderate(p.community_id)));

create function horion_private.moderate_reported_post(p_post_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); authorized_post uuid;
begin
  if actor is null or not exists(select 1 from horion.profiles where id=actor) then
    raise exception 'Horion moderator required' using errcode='42501';
  end if;
  select id into authorized_post from horion.posts
    where id=p_post_id and horion_private.can_moderate(community_id) for update;
  if not found then raise exception 'Horion moderator required' using errcode='42501'; end if;
  -- Existing audit triggers record both mutations with the authenticated actor.
  update horion.posts set status='removed' where id=authorized_post;
  update horion.reports set status='resolved' where post_id=authorized_post and status='open';
end;
$$;
revoke all on function horion_private.moderate_reported_post(uuid) from public,anon,authenticated;
grant execute on function horion_private.moderate_reported_post(uuid) to authenticated;
create function horion.moderate_reported_post(p_post_id uuid)
returns void language sql security invoker set search_path='' as $$
  select horion_private.moderate_reported_post(p_post_id);
$$;
revoke all on function horion.moderate_reported_post(uuid) from public,anon,authenticated;
grant execute on function horion.moderate_reported_post(uuid) to authenticated;
commit;
