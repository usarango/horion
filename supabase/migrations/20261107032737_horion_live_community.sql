begin;
-- Live community primitives only. No seeds, Auth hooks, Rango objects or global
-- project configuration are created/changed by this migration.

-- An account category describes a public profile; it never grants permissions.
alter table horion.profiles
  add column account_type text not null default 'member' check(account_type in ('member','store')),
  add column website text check(website is null or (char_length(website)<=500 and website ~ '^https://[^[:space:]]+$')),
  add column contact_email text check(contact_email is null or (char_length(contact_email)<=254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
grant insert(account_type,website,contact_email),update(account_type,website,contact_email) on horion.profiles to authenticated;
comment on column horion.profiles.account_type is 'Self-declared public profile category. Store is not a trusted role, verification, seller approval or marketplace entitlement.';
comment on column horion.profiles.contact_email is 'Optional email intentionally published by the member; never populated from the Auth email automatically.';

-- Preserve the original three arguments through defaults, without ambiguous
-- PostgREST overloads. Existing memberships remain intact and idempotent.
drop function horion.onboard_member(text,text,text);
create function horion.onboard_member(
  p_username text,
  p_display_name text default 'Horion member',
  p_locale text default 'en',
  p_account_type text default 'member',
  p_website text default null,
  p_contact_email text default null
) returns setof horion.profiles language plpgsql security invoker set search_path='' as $$
declare
  member_id uuid := (select auth.uid());
  initial_username text;
  website_value text := nullif(btrim(p_website),'');
  contact_value text := nullif(lower(btrim(p_contact_email)),'');
begin
  if member_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_username is not null and p_username !~ '^[a-z0-9_]{3,32}$' then raise exception 'Invalid username' using errcode='22023'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80 then raise exception 'Invalid display name' using errcode='22023'; end if;
  if p_locale is null or p_locale not in ('en','pt-BR','es') then raise exception 'Invalid locale' using errcode='22023'; end if;
  if p_account_type is null or p_account_type not in ('member','store') then raise exception 'Invalid account type' using errcode='22023'; end if;
  if website_value is not null and (char_length(website_value)>500 or website_value !~ '^https://[^[:space:]]+$') then raise exception 'Invalid website' using errcode='22023'; end if;
  if contact_value is not null and (char_length(contact_value)>254 or contact_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'Invalid contact email' using errcode='22023'; end if;
  initial_username := coalesce(p_username,replace(member_id::text,'-',''));
  insert into horion.profiles(id,username,display_name,locale,account_type,website,contact_email)
    values(member_id,initial_username,btrim(p_display_name),p_locale,p_account_type,website_value,contact_value)
    on conflict(id) do nothing;
  insert into horion.profile_private(user_id) values(member_id) on conflict(user_id) do nothing;
  return query select p.* from horion.profiles p where p.id=member_id;
end;
$$;
revoke all on function horion.onboard_member(text,text,text,text,text,text) from public,anon;
grant execute on function horion.onboard_member(text,text,text,text,text,text) to authenticated;

-- Trusted roles remain private and require an administrative assignment.
alter table horion_private.user_roles drop constraint user_roles_role_check;
alter table horion_private.user_roles add constraint user_roles_role_check check(role in ('admin','editor','moderator'));
create function horion_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from horion_private.user_roles where user_id=(select auth.uid()) and role in ('admin','moderator'));
$$;
revoke all on function horion_private.is_staff() from public,anon,authenticated;
grant execute on function horion_private.is_staff() to anon,authenticated;
create or replace function horion_private.can_moderate(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    horion_private.is_staff() or exists(select 1 from horion_private.community_moderators where community_id=target and user_id=(select auth.uid()))
  );
$$;
-- Only the caller's role/scopes are exposed, never the private role directory.
create function horion_private.my_role() returns text language sql stable security definer set search_path='' as $$
  select case when (select auth.uid()) is not null and exists(select 1 from horion.profiles where id=(select auth.uid()))
    then coalesce((select role from horion_private.user_roles where user_id=(select auth.uid())),'member') else null end;
$$;
create function horion_private.my_moderated_communities() returns uuid[] language sql stable security definer set search_path='' as $$
  select case when (select auth.uid()) is null then '{}'::uuid[] else
    coalesce((select array_agg(community_id order by community_id) from horion_private.community_moderators where user_id=(select auth.uid())),'{}'::uuid[]) end;
$$;
revoke all on function horion_private.my_role(),horion_private.my_moderated_communities() from public,anon,authenticated;
grant execute on function horion_private.my_role(),horion_private.my_moderated_communities() to authenticated;
create function horion.get_my_role() returns text language sql stable security invoker set search_path='' as $$ select horion_private.my_role(); $$;
create function horion.get_my_moderated_communities() returns uuid[] language sql stable security invoker set search_path='' as $$ select horion_private.my_moderated_communities(); $$;
revoke all on function horion.get_my_role(),horion.get_my_moderated_communities() from public,anon,authenticated;
grant execute on function horion.get_my_role(),horion.get_my_moderated_communities() to authenticated;

alter table horion.communities add column created_by uuid references horion.profiles(id) on delete set null;
create index communities_creator_idx on horion.communities(created_by,created_at desc);
-- The private helper is privileged solely to create a scoped community role.
-- It accepts no actor ID, role, visibility or moderator list from the caller.
create function horion_private.create_community(p_name text,p_slug text,p_description text,p_rules text)
returns setof horion.communities language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid()); created horion.communities%rowtype;
begin
  if actor is null or not exists(select 1 from horion.profiles where id=actor) then raise exception 'Horion membership required' using errcode='42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then raise exception 'Invalid community name' using errcode='22023'; end if;
  if p_slug is null or char_length(p_slug) not between 2 and 64 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid community slug' using errcode='22023'; end if;
  if p_description is null or char_length(p_description)>2000 or p_rules is null or char_length(p_rules)>10000 then raise exception 'Invalid community description or rules' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('horion-community:'||actor::text,0));
  if (select count(*) from horion.communities where created_by=actor and created_at>now()-interval '1 day')>=5 then raise exception 'Community creation limit reached; try again later' using errcode='P0001'; end if;
  insert into horion.communities(name,slug,description,rules,created_by)
    values(btrim(p_name),p_slug,p_description,p_rules,actor) returning * into created;
  insert into horion.memberships(community_id,user_id) values(created.id,actor);
  insert into horion_private.community_moderators(community_id,user_id) values(created.id,actor);
  insert into horion_private.audit_log(actor_id,entity,entity_id,operation) values(actor,'communities',created.id::text,'create');
  return next created;
end;
$$;
revoke all on function horion_private.create_community(text,text,text,text) from public,anon,authenticated;
grant execute on function horion_private.create_community(text,text,text,text) to authenticated;
create function horion.create_community(p_name text,p_slug text,p_description text default '',p_rules text default '')
returns setof horion.communities language sql security invoker set search_path='' as $$ select * from horion_private.create_community(p_name,p_slug,p_description,p_rules); $$;
revoke all on function horion.create_community(text,text,text,text) from public,anon,authenticated;
grant execute on function horion.create_community(text,text,text,text) to authenticated;
grant update(name,description,rules,image_path) on horion.communities to authenticated;
create policy community_moderation_update on horion.communities for update to authenticated
  using(horion_private.can_moderate(id)) with check(horion_private.can_moderate(id));

-- Manual collection metadata is owner-declared and does not create a catalog
-- reference or assert technical specifications/authenticity.
alter table horion.user_watches
  add column brand_name text check(brand_name is null or char_length(brand_name) between 1 and 100),
  add column model_name text check(model_name is null or char_length(model_name) between 1 and 160),
  add column reference_label text check(reference_label is null or char_length(reference_label) between 1 and 160);
grant update(brand_name,model_name,reference_label) on horion.user_watches to authenticated;
comment on column horion.user_watches.reference_label is 'Owner-entered reference label; not an approved catalog association or specification.';

-- Members submit pending suggestions. Only trusted global staff can review or
-- curate the normalized catalog; a store or community creator is not staff.
drop policy reference_read on horion.watch_references;
create policy reference_read on horion.watch_references for select to anon,authenticated using(review_status='approved' or (select horion_private.is_staff()));
drop policy source_read on horion.catalog_sources;
create policy source_read on horion.catalog_sources for select to anon,authenticated using((select horion_private.is_staff()) or exists(select 1 from horion.watch_references r where r.id=reference_id and r.review_status='approved'));
drop policy revision_read on horion.catalog_revisions;
create policy revision_read on horion.catalog_revisions for select to authenticated using(contributor_id=(select auth.uid()) or (select horion_private.is_staff()));
grant update(status) on horion.catalog_revisions to authenticated;
create policy revision_staff_update on horion.catalog_revisions for update to authenticated using((select horion_private.is_staff())) with check((select horion_private.is_staff()));
-- JSON payloads are bounded at the database too; unknown facts stay suggestions.
alter table horion.catalog_revisions add constraint catalog_suggestion_bounded check(jsonb_typeof(suggestion)='object' and octet_length(suggestion::text)<=20000);
alter table horion.catalog_revisions add constraint catalog_source_url_bounded check(source_url is null or (char_length(source_url)<=2000 and source_url ~ '^https://[^[:space:]]+$'));
create function horion_private.check_catalog_suggestion() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or new.contributor_id<>(select auth.uid()) then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('horion-catalog-suggestion:'||new.contributor_id::text,0));
  if (select count(*) from horion.catalog_revisions where contributor_id=new.contributor_id and created_at>now()-interval '1 hour')>=10 then raise exception 'Catalog suggestion limit reached' using errcode='P0001'; end if;
  new.created_at:=now(); new.status:='pending'; return new;
end;
$$;
revoke all on function horion_private.check_catalog_suggestion() from public,anon,authenticated;
create trigger catalog_suggestion_guard before insert on horion.catalog_revisions for each row execute function horion_private.check_catalog_suggestion();
do $$ declare n text; begin
  foreach n in array array['brands','watch_collections','watch_models','movements','watch_references','catalog_sources'] loop
    execute format('grant insert,update on horion.%I to authenticated',n);
    execute format('create policy catalog_staff_insert on horion.%I for insert to authenticated with check ((select horion_private.is_staff()))',n);
    execute format('create policy catalog_staff_update on horion.%I for update to authenticated using ((select horion_private.is_staff())) with check ((select horion_private.is_staff()))',n);
  end loop;
end $$;

-- Reports and the public moderation log are visible only to involved reporters
-- or global staff, as appropriate. Private collection documents remain owner-only.
drop policy report_read on horion.reports;
create policy report_read on horion.reports for select to authenticated using(reporter_id=(select auth.uid()) or (select horion_private.is_staff()));
drop policy report_mod_update on horion.reports;
create policy report_mod_update on horion.reports for update to authenticated using((select horion_private.is_staff())) with check((select horion_private.is_staff()));
drop policy moderation_read on horion.moderation_actions;
create policy moderation_read on horion.moderation_actions for select to authenticated using((select horion_private.is_staff()));


-- Record moderation/curation identifiers, never contact fields or private files.
-- Trigger-only helper: authenticated writes have already passed row policies;
-- trusted direct database operations may have no end-user JWT and are marked null.
create function horion_private.audit_live_edit() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null and current_setting('role',true) in ('anon','authenticated') then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  insert into horion_private.audit_log(actor_id,entity,entity_id,operation)
    values(actor,tg_table_name,new.id::text,lower(tg_op));
  return new;
end;
$$;
revoke all on function horion_private.audit_live_edit() from public,anon,authenticated;
create trigger audit_community_edit after update on horion.communities for each row execute function horion_private.audit_live_edit();
create trigger audit_report_resolution after update on horion.reports for each row execute function horion_private.audit_live_edit();
do $$ declare n text; begin
  foreach n in array array['brands','watch_collections','watch_models','movements','watch_references','catalog_sources','catalog_revisions'] loop
    execute format('create trigger audit_catalog_edit after insert or update on horion.%I for each row execute function horion_private.audit_live_edit()',n);
  end loop;
end $$;

commit;
