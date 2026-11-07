begin;
-- Horion foundation. No seed claims or manufacturer specifications.
-- Sensitive values live in separate tables; public collection rows cannot leak them.
-- Additive shared-project baseline. Never create or alter objects in public,
-- never attach a trigger to auth.users, never change shared Auth settings.
-- Abort on namespace collisions rather than treating an existing app as ours.
-- RLS policies cannot protect Storage if RLS was disabled by another stack.
-- Fail closed without altering the existing Storage table or its configuration.
do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relname='objects' and c.relkind='r' and c.relrowsecurity
  ) then
    raise exception 'Horion requires existing storage.objects with RLS enabled; no changes were applied.';
  end if;
end;
$$;
create schema horion;
revoke all on schema horion from public;
grant usage on schema horion to anon, authenticated;
create schema horion_private;
revoke all on schema horion_private from public;
grant usage on schema horion_private to anon, authenticated;

create table horion.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 1200),
  country text check (char_length(country) <= 80),
  locale text not null default 'en' check (locale in ('en','pt-BR','es')),
  avatar_path text,
  collection_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table horion.profile_private (
  user_id uuid primary key references horion.profiles(id) on delete cascade,
  notification_preferences jsonb not null default '{}',
  export_requested_at timestamptz,
  deletion_requested_at timestamptz
);
create table horion_private.user_roles (
  user_id uuid primary key references horion.profiles(id) on delete cascade,
  role text not null check (role in ('admin','editor'))
);
alter table horion_private.user_roles enable row level security;
-- Internal lookup only. Roles are never taken from user-editable metadata.
create function horion_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from horion_private.user_roles where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function horion_private.is_admin() from public;
grant execute on function horion_private.is_admin() to anon, authenticated;

create table horion.follows (
  follower_id uuid not null references horion.profiles(id) on delete cascade,
  followed_id uuid not null references horion.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id), check (follower_id <> followed_id)
);
create index follows_followed_idx on horion.follows(followed_id);
create table horion.blocks (
  user_id uuid not null references horion.profiles(id) on delete cascade,
  blocked_id uuid not null references horion.profiles(id) on delete cascade,
  primary key(user_id, blocked_id), check(user_id <> blocked_id)
);
create index blocks_blocked_idx on horion.blocks(blocked_id);
create table horion.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  rules text not null default '' check (char_length(rules) <= 10000),
  image_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create table horion.memberships (
  community_id uuid not null references horion.communities(id) on delete cascade,
  user_id uuid not null references horion.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(community_id,user_id)
);
create index memberships_user_idx on horion.memberships(user_id,community_id);
create table horion_private.community_moderators (
  community_id uuid not null references horion.communities(id) on delete cascade,
  user_id uuid not null references horion.profiles(id) on delete cascade,
  primary key(community_id,user_id)
);
alter table horion_private.community_moderators enable row level security;
create function horion_private.can_moderate(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    horion_private.is_admin() or exists(select 1 from horion_private.community_moderators where community_id=target and user_id=(select auth.uid()))
  );
$$;
revoke all on function horion_private.can_moderate(uuid) from public;
grant execute on function horion_private.can_moderate(uuid) to anon,authenticated;

-- Check both directions without exposing either member's private block list.
create function horion_private.is_blocked(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from horion.blocks b where
    (b.user_id=(select auth.uid()) and b.blocked_id=target) or
    (b.blocked_id=(select auth.uid()) and b.user_id=target));
$$;
revoke all on function horion_private.is_blocked(uuid) from public;
grant execute on function horion_private.is_blocked(uuid) to anon,authenticated;

create table horion.brands (
  id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique,
  description text not null default ''
);
create table horion.watch_collections (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references horion.brands(id),
  name text not null, unique(brand_id,name)
);
create table horion.watch_models (
  id uuid primary key default gen_random_uuid(), collection_id uuid not null references horion.watch_collections(id),
  name text not null, unique(collection_id,name)
);
create table horion.movements (
  id uuid primary key default gen_random_uuid(), manufacturer text, calibre text not null,
  mechanism text check(mechanism in ('manual','automatic','quartz','solar','electronic','other')),
  power_reserve_hours numeric check(power_reserve_hours > 0)
);
create table horion.watch_references (
  id uuid primary key default gen_random_uuid(), model_id uuid not null references horion.watch_models(id),
  reference text not null, description text not null default '', movement_id uuid references horion.movements(id),
  diameter_mm numeric check(diameter_mm > 0), thickness_mm numeric check(thickness_mm > 0),
  lug_to_lug_mm numeric check(lug_to_lug_mm > 0), water_resistance_m integer check(water_resistance_m >= 0),
  material text, crystal text, production_from integer, production_to integer,
  review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
  unique(model_id,reference), check(production_to is null or production_from is null or production_to >= production_from)
);
create index watch_references_reference_idx on horion.watch_references(reference);
create index watch_references_model_idx on horion.watch_references(model_id);
create table horion.catalog_sources (
  id uuid primary key default gen_random_uuid(), reference_id uuid not null references horion.watch_references(id) on delete cascade,
  url text not null check(url ~ '^https://'), title text not null,
  accessed_at timestamptz not null default now(), field_names text[] not null default '{}'
);
create table horion.catalog_revisions (
  id uuid primary key default gen_random_uuid(), reference_id uuid references horion.watch_references(id),
  contributor_id uuid references horion.profiles(id) on delete set null, suggestion jsonb not null,
  source_url text check(source_url ~ '^https://'),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index catalog_revisions_contributor_idx on horion.catalog_revisions(contributor_id);

create table horion.posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references horion.profiles(id) on delete cascade,
  community_id uuid not null references horion.communities(id), reference_id uuid references horion.watch_references(id),
  title text not null check(char_length(title) between 3 and 240),
  body text not null check(char_length(body) between 1 and 20000),
  kind text not null default 'discussion' check(kind in ('text','photography','discussion','review','question','guide','video','poll')),
  language text not null default 'en' check(language in ('en','pt-BR','es')),
  status text not null default 'published' check(status in ('published','removed','deleted')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(), edited_at timestamptz
);
create index posts_feed_idx on horion.posts(community_id,created_at desc) where status='published';
create index posts_author_idx on horion.posts(author_id,created_at desc);
create index posts_reference_idx on horion.posts(reference_id);
create index posts_search_idx on horion.posts using gin(to_tsvector('simple',title || ' ' || body));
create table horion.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references horion.posts(id) on delete cascade,
  author_id uuid not null references horion.profiles(id) on delete cascade,
  parent_id uuid, body text not null check(char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(), edited_at timestamptz,
  unique(id,post_id), foreign key(parent_id,post_id) references horion.comments(id,post_id) on delete set null (parent_id)
);
create index comments_post_idx on horion.comments(post_id,created_at);
create index comments_author_idx on horion.comments(author_id);
create table horion.votes (
  post_id uuid not null references horion.posts(id) on delete cascade,
  user_id uuid not null references horion.profiles(id) on delete cascade,
  value smallint not null check(value in (-1,1)), created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create index votes_user_idx on horion.votes(user_id);
create table horion.saved_posts (
  post_id uuid not null references horion.posts(id) on delete cascade,
  user_id uuid not null references horion.profiles(id) on delete cascade,
  primary key(post_id,user_id)
);
create index saved_posts_user_idx on horion.saved_posts(user_id);
create table horion.media (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references horion.profiles(id) on delete cascade,
  post_id uuid not null references horion.posts(id) on delete cascade,
  storage_path text not null unique, alt_text text not null default '',
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 8388608),
  check(split_part(storage_path,'/',1) = owner_id::text),
  check(split_part(storage_path,'/',2) = post_id::text)
);
create index media_post_idx on horion.media(post_id);
create index media_owner_idx on horion.media(owner_id);

create table horion.user_watches (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references horion.profiles(id) on delete cascade,
  reference_id uuid references horion.watch_references(id), label text not null check(char_length(label) between 1 and 160),
  status text not null default 'owned' check(status in ('owned','previously-owned','wishlist')),
  visibility text not null default 'private' check(visibility in ('private','public')),
  condition text, strap text, created_at timestamptz not null default now(),
  unique(id,owner_id)
);
create index user_watches_owner_idx on horion.user_watches(owner_id,status);
create index user_watches_reference_idx on horion.user_watches(reference_id);
create table horion.watch_private (
  watch_id uuid primary key, owner_id uuid not null references horion.profiles(id) on delete cascade,
  serial_number text check(char_length(serial_number) <= 160), acquired_at date,
  acquisition_amount numeric(18,2) check(acquisition_amount >= 0), currency char(3),
  notes text not null default '' check(char_length(notes) <= 10000),
  foreign key(watch_id,owner_id) references horion.user_watches(id,owner_id) on delete cascade
);
create index watch_private_owner_idx on horion.watch_private(owner_id);
create table horion.passports (
  id uuid primary key default gen_random_uuid(), watch_id uuid not null unique,
  owner_id uuid not null references horion.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(id,owner_id), foreign key(watch_id,owner_id) references horion.user_watches(id,owner_id) on delete cascade
);
create index passports_owner_idx on horion.passports(owner_id);
create table horion.passport_events (
  id uuid primary key default gen_random_uuid(), passport_id uuid not null,
  owner_id uuid not null references horion.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('acquisition','service','maintenance','restoration','strap','component','inspection','valuation','sale')),
  occurred_on date not null, description text not null check(char_length(description) between 1 and 5000),
  verification text not null default 'owner-declared' check(verification in ('owner-declared','documents-presented','partner-verified')),
  created_at timestamptz not null default now(), foreign key(passport_id,owner_id) references horion.passports(id,owner_id) on delete cascade
);
create index passport_events_timeline_idx on horion.passport_events(passport_id,occurred_on desc);
create index passport_events_owner_idx on horion.passport_events(owner_id);
create table horion.passport_documents (
  id uuid primary key default gen_random_uuid(), passport_id uuid not null,
  owner_id uuid not null references horion.profiles(id) on delete cascade,
  storage_path text not null unique, file_name text not null check(char_length(file_name) between 1 and 240),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key(passport_id,owner_id) references horion.passports(id,owner_id) on delete cascade,
  check(split_part(storage_path,'/',1)=owner_id::text),
  check(split_part(storage_path,'/',2)=passport_id::text)
);
create index passport_documents_owner_idx on horion.passport_documents(owner_id);
create index passport_documents_passport_idx on horion.passport_documents(passport_id);

create table horion.reputation_rules (
  code text primary key, points integer not null check(points between 1 and 100),
  daily_limit integer not null check(daily_limit between 1 and 50), active boolean not null default true
);
create table horion.reputation_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references horion.profiles(id) on delete cascade,
  rule_code text not null references horion.reputation_rules(code),
  points integer not null check(points between -100 and 100 and points <> 0),
  evidence_key text not null, reverses_id uuid unique,
  granted_by uuid references horion.profiles(id) on delete set null, created_at timestamptz not null default now(),
  unique(user_id,rule_code,evidence_key),
  unique(id,user_id),
  foreign key(reverses_id,user_id) references horion.reputation_events(id,user_id) on delete set null (reverses_id)
);
create index reputation_events_user_idx on horion.reputation_events(user_id,created_at desc);
create table horion.reputation_levels (
  id integer primary key, name text not null unique, threshold integer not null unique check(threshold>=0)
);
create table horion.badges (
  id uuid primary key default gen_random_uuid(), name text not null unique, criteria text not null
);
create table horion.user_badges (
  user_id uuid not null references horion.profiles(id) on delete cascade,
  badge_id uuid not null references horion.badges(id), awarded_at timestamptz not null default now(),
  primary key(user_id,badge_id)
);
create table horion.subscription_plans (
  id text primary key, name text not null, active boolean not null default false
);
create table horion.entitlement_definitions (
  code text primary key, description text not null
);
create table horion.plan_entitlements (
  plan_id text not null references horion.subscription_plans(id),
  entitlement_code text not null references horion.entitlement_definitions(code),
  primary key(plan_id,entitlement_code)
);
create table horion.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references horion.profiles(id) on delete cascade,
  plan_id text not null references horion.subscription_plans(id),
  status text not null check(status in ('trial','active','past_due','cancelled','expired')),
  current_period_end timestamptz, created_at timestamptz not null default now()
);
create index subscriptions_user_idx on horion.subscriptions(user_id);
create table horion.billing_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references horion.profiles(id) on delete set null,
  external_event_id text not null unique, event_type text not null, received_at timestamptz not null default now()
);
create table horion.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references horion.profiles(id) on delete cascade,
  kind text not null, title text not null, path text, read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_recipient_idx on horion.notifications(recipient_id,created_at desc);
create table horion.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references horion.profiles(id) on delete cascade,
  post_id uuid not null references horion.posts(id) on delete cascade,
  reason text not null check(char_length(reason) between 5 and 2000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(), unique(reporter_id,post_id)
);
create index reports_post_idx on horion.reports(post_id);
create index reports_reporter_idx on horion.reports(reporter_id);
create table horion.moderation_actions (
  id uuid primary key default gen_random_uuid(), actor_id uuid references horion.profiles(id) on delete set null,
  post_id uuid references horion.posts(id) on delete set null, action text not null,
  created_at timestamptz not null default now()
);
create table horion.editorial_content (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  author_id uuid references horion.profiles(id) on delete set null, title text not null,
  body text not null, language text not null check(language in ('en','pt-BR','es')),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  reference_id uuid references horion.watch_references(id), meta_description text,
  published_at timestamptz, created_at timestamptz not null default now()
);
create index editorial_published_idx on horion.editorial_content(published_at desc) where status='published';
create table horion_private.audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid, entity text not null,
  entity_id text, operation text not null, created_at timestamptz not null default now()
);
alter table horion_private.audit_log enable row level security;

-- Deny by default only inside Horion; existing application grants stay intact.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='horion' and tablename = any(array['profiles','profile_private','follows','blocks','communities','memberships','brands','watch_collections','watch_models','movements','watch_references','catalog_sources','catalog_revisions','posts','comments','votes','saved_posts','media','user_watches','watch_private','passports','passport_events','passport_documents','reputation_rules','reputation_events','reputation_levels','badges','user_badges','subscription_plans','entitlement_definitions','plan_entitlements','subscriptions','billing_events','notifications','reports','moderation_actions','editorial_content']) loop
    execute format('alter table horion.%I enable row level security',t.tablename);
    execute format('revoke all on horion.%I from public, anon, authenticated',t.tablename);
  end loop;
end $$;

-- A shared project may have global default grants, including TO PUBLIC.
-- Revoke only on our newly created objects, never on existing app objects.
revoke all on all tables in schema horion_private from public,anon,authenticated;

-- Public editorial/catalog/community reads contain no private ownership data.
do $$ declare n text; begin
  foreach n in array array['profiles','communities','brands','watch_collections','watch_models','movements','reputation_rules','reputation_levels','badges','user_badges','subscription_plans','entitlement_definitions','plan_entitlements'] loop
    execute format('grant select on horion.%I to anon, authenticated',n);
    execute format('create policy public_read on horion.%I for select to anon, authenticated using (true)',n);
  end loop;
end $$;
grant select on horion.watch_references,horion.catalog_sources to anon,authenticated;
create policy reference_read on horion.watch_references for select to anon,authenticated using(review_status='approved' or (select horion_private.is_admin()));
create policy source_read on horion.catalog_sources for select to anon,authenticated using(exists(select 1 from horion.watch_references r where r.id=reference_id and r.review_status='approved'));
grant update(username,display_name,bio,country,locale,avatar_path,collection_public) on horion.profiles to authenticated;
create policy profile_update on horion.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

-- Public visibility also observes profile-level collection privacy.
grant select on horion.user_watches to anon,authenticated;
create policy watch_read on horion.user_watches for select to anon,authenticated using(owner_id=(select auth.uid()) or (visibility='public' and exists(select 1 from horion.profiles p where p.id=owner_id and p.collection_public)));
grant insert,delete on horion.user_watches to authenticated;
grant update(label,status,visibility,condition,strap,reference_id) on horion.user_watches to authenticated;
create policy watch_insert on horion.user_watches for insert to authenticated with check(owner_id=(select auth.uid()));
create policy watch_update on horion.user_watches for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy watch_delete on horion.user_watches for delete to authenticated using(owner_id=(select auth.uid()));

-- Owner-only records: no administrator override for personal documents or serials.
do $$ declare n text; col text; begin
  foreach n in array array['profile_private','watch_private','passports','passport_events','passport_documents','saved_posts','blocks'] loop
    col := case when n='profile_private' or n='saved_posts' or n='blocks' then 'user_id' else 'owner_id' end;
    execute format('grant select,insert,delete on horion.%I to authenticated',n);
    execute format('create policy owner_read on horion.%I for select to authenticated using (%I=(select auth.uid()))',n,col);
    execute format('create policy owner_insert on horion.%I for insert to authenticated with check (%I=(select auth.uid()))',n,col);
    execute format('create policy owner_delete on horion.%I for delete to authenticated using (%I=(select auth.uid()))',n,col);
  end loop;
end $$;
grant update on horion.profile_private,horion.watch_private to authenticated;
create policy profile_private_update on horion.profile_private for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy watch_private_update on horion.watch_private for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- Prevent self-attestation of partner verification even through the raw Data API.
drop policy owner_insert on horion.passport_events;
create policy event_insert on horion.passport_events for insert to authenticated with check(owner_id=(select auth.uid()) and verification='owner-declared');
-- Passport transfer intentionally unavailable: owner IDs have no UPDATE grants.

grant select on horion.posts,horion.comments,horion.media,horion.votes to anon,authenticated;
create policy post_read on horion.posts for select to anon,authenticated using((status='published' and exists(select 1 from horion.communities c where c.id=community_id and c.is_public)) or author_id=(select auth.uid()) or horion_private.can_moderate(community_id));
create policy comment_read on horion.comments for select to anon,authenticated using(exists(select 1 from horion.posts p where p.id=post_id));
create policy media_read on horion.media for select to anon,authenticated using(exists(select 1 from horion.posts p where p.id=post_id and p.status='published'));
create policy vote_read on horion.votes for select to anon,authenticated using(exists(select 1 from horion.posts p where p.id=post_id and p.status='published'));
grant select,insert,delete on horion.memberships to authenticated;
create policy membership_read on horion.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy membership_insert on horion.memberships for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from horion.communities c where c.id=community_id and c.is_public));
create policy membership_delete on horion.memberships for delete to authenticated using(user_id=(select auth.uid()));

-- Serialize per-user publishing to avoid races in the database-backed rate limit.
create function horion_private.check_post_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or new.author_id <> (select auth.uid()) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('horion-post:'||new.author_id::text,0));
  if (select count(*) from horion.posts where author_id=new.author_id and created_at > now()-interval '1 minute') >= 5 then
    raise exception 'Publishing rate limit reached' using errcode='P0001';
  end if;
  new.created_at := now(); new.edited_at := null; new.pinned := false; new.status := 'published';
  return new;
end;
$$;
revoke all on function horion_private.check_post_insert() from public,anon,authenticated;
create trigger post_insert_guard before insert on horion.posts for each row execute function horion_private.check_post_insert();
grant insert on horion.posts to authenticated;
grant update(title,body,edited_at,status,pinned) on horion.posts to authenticated;
create policy post_insert on horion.posts for insert to authenticated with check(author_id=(select auth.uid()) and status='published' and not pinned and exists(select 1 from horion.memberships m where m.community_id=posts.community_id and m.user_id=(select auth.uid())));
create policy post_owner_update on horion.posts for update to authenticated using(author_id=(select auth.uid()) and status='published') with check(author_id=(select auth.uid()) and status in ('published','deleted') and not pinned);
create policy post_mod_update on horion.posts for update to authenticated using(horion_private.can_moderate(community_id)) with check(horion_private.can_moderate(community_id));

grant insert,delete on horion.comments to authenticated;
grant update(body,edited_at) on horion.comments to authenticated;
create policy comment_insert on horion.comments for insert to authenticated with check(author_id=(select auth.uid()) and exists(select 1 from horion.posts p where p.id=post_id and p.status='published') and not exists(select 1 from horion.posts p where p.id=post_id and horion_private.is_blocked(p.author_id)));
create policy comment_update on horion.comments for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy comment_delete on horion.comments for delete to authenticated using(author_id=(select auth.uid()));
grant insert,delete on horion.votes to authenticated;
grant update(value) on horion.votes to authenticated;
create policy vote_insert on horion.votes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from horion.posts p where p.id=post_id and p.status='published' and p.author_id<>(select auth.uid()) and not horion_private.is_blocked(p.author_id)));
create policy vote_update on horion.votes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy vote_delete on horion.votes for delete to authenticated using(user_id=(select auth.uid()));

-- Only update the vote's value during conflict resolution; immutable identity
-- columns are never granted UPDATE permission to browser roles.
create function horion.cast_vote(p_post_id uuid,p_value smallint) returns setof horion.votes
language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_value=0 then
    return query delete from horion.votes where post_id=p_post_id and user_id=(select auth.uid()) returning *;
  elsif p_value in (-1,1) then
    return query insert into horion.votes(post_id,user_id,value) values(p_post_id,(select auth.uid()),p_value)
      on conflict(post_id,user_id) do update set value=excluded.value returning *;
  else raise exception 'Invalid vote' using errcode='22023'; end if;
end;
$$;
revoke all on function horion.cast_vote(uuid,smallint) from public,anon;
grant execute on function horion.cast_vote(uuid,smallint) to authenticated;

grant insert,delete on horion.media to authenticated;
create policy media_insert on horion.media for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from horion.posts p where p.id=post_id and p.author_id=(select auth.uid())));
create policy media_delete on horion.media for delete to authenticated using(owner_id=(select auth.uid()));

grant select,insert,delete on horion.follows to authenticated;
create policy follows_read on horion.follows for select to authenticated using(follower_id=(select auth.uid()) or followed_id=(select auth.uid()));
create policy follows_insert on horion.follows for insert to authenticated with check(follower_id=(select auth.uid()) and not horion_private.is_blocked(followed_id));
create policy follows_delete on horion.follows for delete to authenticated using(follower_id=(select auth.uid()));
grant select,insert on horion.catalog_revisions to authenticated;
create policy revision_read on horion.catalog_revisions for select to authenticated using(contributor_id=(select auth.uid()) or (select horion_private.is_admin()));
create policy revision_insert on horion.catalog_revisions for insert to authenticated with check(contributor_id=(select auth.uid()) and status='pending');
grant select on horion.reputation_events,horion.subscriptions to authenticated;
create policy reputation_owner_read on horion.reputation_events for select to authenticated using(user_id=(select auth.uid()));
create policy subscription_owner_read on horion.subscriptions for select to authenticated using(user_id=(select auth.uid()));
-- No user INSERT/UPDATE on reputation, badges, billing or entitlements.
grant select on horion.notifications to authenticated;
grant update(read_at) on horion.notifications to authenticated;
create policy notification_read on horion.notifications for select to authenticated using(recipient_id=(select auth.uid()));
create policy notification_update on horion.notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
grant select,insert on horion.reports to authenticated;
grant update(status) on horion.reports to authenticated;
create policy report_read on horion.reports for select to authenticated using(reporter_id=(select auth.uid()) or (select horion_private.is_admin()));
create policy report_insert on horion.reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='open');
create policy report_mod_update on horion.reports for update to authenticated using((select horion_private.is_admin())) with check((select horion_private.is_admin()));
grant select on horion.moderation_actions to authenticated;
create policy moderation_read on horion.moderation_actions for select to authenticated using((select horion_private.is_admin()));
grant select on horion.editorial_content to anon,authenticated;
create policy editorial_read on horion.editorial_content for select to anon,authenticated using(status='published' or (select horion_private.is_admin()));

-- Auditing stores identifiers/operations, never entire private document/serial contents.
create function horion_private.audit_post_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into horion_private.audit_log(actor_id,entity,entity_id,operation) values((select auth.uid()),'posts',new.id::text,'update');
  if new.status is distinct from old.status or new.pinned is distinct from old.pinned then
    insert into horion.moderation_actions(actor_id,post_id,action) values((select auth.uid()),new.id,'status:'||new.status||',pinned:'||new.pinned::text);
  end if;
  return new;
end;
$$;
revoke all on function horion_private.audit_post_change() from public,anon,authenticated;
create trigger audit_post_update after update on horion.posts for each row execute function horion_private.audit_post_change();

-- Explicit Horion membership only. Existing global Auth users/triggers are
-- untouched; visiting another app or creating an Auth account creates no Horion rows.
grant insert(id,username,display_name,locale) on horion.profiles to authenticated;
create policy profile_explicit_onboarding on horion.profiles for insert to authenticated
  with check(id=(select auth.uid()));
create function horion.onboard_member(
  p_username text,
  p_display_name text default 'Horion member',
  p_locale text default 'en'
) returns setof horion.profiles language plpgsql security invoker set search_path='' as $$
declare member_id uuid := (select auth.uid()); initial_username text;
begin
  if member_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_username is not null and p_username !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'Invalid username' using errcode='22023';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'Invalid display name' using errcode='22023';
  end if;
  if p_locale is null or p_locale not in ('en','pt-BR','es') then
    raise exception 'Invalid locale' using errcode='22023';
  end if;
  initial_username := coalesce(p_username,replace(member_id::text,'-',''));
  insert into horion.profiles(id,username,display_name,locale)
    values(member_id,initial_username,btrim(p_display_name),p_locale)
    on conflict(id) do nothing;
  insert into horion.profile_private(user_id) values(member_id) on conflict(user_id) do nothing;
  return query select p.* from horion.profiles p where p.id=member_id;
end;
$$;
revoke all on function horion.onboard_member(text,text,text) from public,anon;
grant execute on function horion.onboard_member(text,text,text) to authenticated;

-- Bucket IDs and policy names are app-specific. Existing Storage grants and
-- permissive policies may OR together, so RESTRICTIVE guards also enforce the
-- Horion boundary. Every non-Horion bucket passes those guards unchanged.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('horion-passport-documents','horion-passport-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
       ('horion-post-media','horion-post-media',false,8388608,array['image/jpeg','image/png','image/webp']);

create function horion_private.can_read_public_media(target_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from horion.media m join horion.posts p on p.id=m.post_id where m.storage_path=target_name and p.status='published');
$$;
create function horion_private.can_read_storage(target_bucket text,target_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select case target_bucket
    when 'horion-passport-documents' then
      (select auth.uid()) is not null
      and (storage.foldername(target_name))[1]=(select auth.uid())::text
      and exists(select 1 from horion.passports p where p.id::text=(storage.foldername(target_name))[2] and p.owner_id=(select auth.uid()))
    when 'horion-post-media' then
      horion_private.can_read_public_media(target_name)
    else false end;
$$;
create function horion_private.can_write_storage(target_bucket text,target_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null and case target_bucket
    when 'horion-passport-documents' then
      (storage.foldername(target_name))[1]=(select auth.uid())::text
      and exists(select 1 from horion.passports p where p.id::text=(storage.foldername(target_name))[2] and p.owner_id=(select auth.uid()))
    when 'horion-post-media' then
      (storage.foldername(target_name))[1]=(select auth.uid())::text
      and exists(select 1 from horion.posts p where p.id::text=(storage.foldername(target_name))[2] and p.author_id=(select auth.uid()) and p.status='published')
    else false end;
$$;
create function horion_private.can_delete_storage(target_bucket text,target_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select (select auth.uid()) is not null
    and target_bucket in ('horion-passport-documents','horion-post-media')
    and (storage.foldername(target_name))[1]=(select auth.uid())::text
    and exists(select 1 from horion.profiles p where p.id=(select auth.uid()));
$$;
revoke all on function horion_private.can_read_public_media(text),horion_private.can_read_storage(text,text),horion_private.can_write_storage(text,text),horion_private.can_delete_storage(text,text) from public;
grant execute on function horion_private.can_read_public_media(text) to anon,authenticated;
grant execute on function horion_private.can_read_storage(text,text) to authenticated;
grant execute on function horion_private.can_write_storage(text,text),horion_private.can_delete_storage(text,text) to authenticated;

create policy horion_storage_visitor_read on storage.objects for select to anon
  using(bucket_id='horion-post-media' and horion_private.can_read_public_media(name));
create policy horion_storage_read on storage.objects for select to authenticated
  using(bucket_id in ('horion-passport-documents','horion-post-media') and horion_private.can_read_storage(bucket_id,name));
create policy horion_storage_insert on storage.objects for insert to authenticated
  with check(bucket_id in ('horion-passport-documents','horion-post-media') and horion_private.can_write_storage(bucket_id,name));
create policy horion_storage_delete on storage.objects for delete to authenticated
  using(bucket_id in ('horion-passport-documents','horion-post-media') and horion_private.can_delete_storage(bucket_id,name));

create policy horion_storage_visitor_read_guard on storage.objects as restrictive for select to anon
  using(bucket_id not in ('horion-passport-documents','horion-post-media') or (bucket_id='horion-post-media' and horion_private.can_read_public_media(name)));
create policy horion_storage_read_guard on storage.objects as restrictive for select to authenticated
  using(bucket_id not in ('horion-passport-documents','horion-post-media') or horion_private.can_read_storage(bucket_id,name));
-- Also guard anon explicitly: a legacy policy TO PUBLIC may otherwise grant
-- anonymous writes to new buckets. Non-Horion rows still pass unchanged.
create policy horion_storage_visitor_insert_guard on storage.objects as restrictive for insert to anon
  with check(bucket_id not in ('horion-passport-documents','horion-post-media'));
create policy horion_storage_visitor_delete_guard on storage.objects as restrictive for delete to anon
  using(bucket_id not in ('horion-passport-documents','horion-post-media'));
create policy horion_storage_visitor_update_guard on storage.objects as restrictive for update to anon
  using(bucket_id not in ('horion-passport-documents','horion-post-media'))
  with check(bucket_id not in ('horion-passport-documents','horion-post-media'));
create policy horion_storage_insert_guard on storage.objects as restrictive for insert to authenticated
  with check(bucket_id not in ('horion-passport-documents','horion-post-media') or horion_private.can_write_storage(bucket_id,name));
create policy horion_storage_delete_guard on storage.objects as restrictive for delete to authenticated
  using(bucket_id not in ('horion-passport-documents','horion-post-media') or horion_private.can_delete_storage(bucket_id,name));
-- No overwrites or moving objects into/out of Horion buckets, even if a legacy
-- app has a broad UPDATE policy. Other apps' update predicates remain effective.
create policy horion_storage_update_guard on storage.objects as restrictive for update to authenticated
  using(bucket_id not in ('horion-passport-documents','horion-post-media'))
  with check(bucket_id not in ('horion-passport-documents','horion-post-media'));

-- Index foreign-key lookups inside the new schemas only. No existing app index
-- or table is changed; these tables are empty during baseline application.
create index community_moderators_user_idx on horion_private.community_moderators(user_id);
create index watch_references_movement_idx on horion.watch_references(movement_id);
create index catalog_sources_reference_idx on horion.catalog_sources(reference_id);
create index catalog_revisions_reference_idx on horion.catalog_revisions(reference_id);
create index posts_community_fk_idx on horion.posts(community_id);
create index comments_parent_idx on horion.comments(parent_id,post_id);
create index reputation_events_rule_idx on horion.reputation_events(rule_code);
create index reputation_events_grantor_idx on horion.reputation_events(granted_by);
create index user_badges_badge_idx on horion.user_badges(badge_id);
create index plan_entitlements_code_idx on horion.plan_entitlements(entitlement_code);
create index subscriptions_plan_idx on horion.subscriptions(plan_id);
create index billing_events_user_idx on horion.billing_events(user_id);
create index moderation_actions_actor_idx on horion.moderation_actions(actor_id);
create index moderation_actions_post_idx on horion.moderation_actions(post_id);
create index editorial_author_idx on horion.editorial_content(author_id);
create index editorial_reference_idx on horion.editorial_content(reference_id);

comment on table horion.passports is 'Owner-controlled record, not proof of authenticity or ownership. Transfer disabled pending consent and dispute design.';
comment on table horion.reputation_events is 'Trusted backend writes only. Billing and raw activity never grant reputation.';
comment on table horion.watch_private is 'Serials, prices, acquisition dates and notes remain owner-only even for public collections.';

commit;
