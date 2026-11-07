begin;
-- Horion foundation. No seed claims or manufacturer specifications.
-- Sensitive values live in separate tables; public collection rows cannot leak them.
-- This baseline is for a dedicated project. Sharing Rango requires a separately
-- reviewed namespace/Auth/Storage strategy; do not run it on an existing app.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  ) then
    raise exception 'Horion baseline requires an empty public schema. Existing application tables were found; no changes have been applied.';
  end if;
end;
$$;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create table public.profiles (
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
create table public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notification_preferences jsonb not null default '{}',
  export_requested_at timestamptz,
  deletion_requested_at timestamptz
);
create table app_private.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','editor'))
);
alter table app_private.user_roles enable row level security;
-- Internal lookup only. Roles are never taken from user-editable metadata.
create function app_private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from app_private.user_roles where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to anon, authenticated;

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id), check (follower_id <> followed_id)
);
create index follows_followed_idx on public.follows(followed_id);
create table public.blocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  primary key(user_id, blocked_id), check(user_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);
create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,64}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  rules text not null default '' check (char_length(rules) <= 10000),
  image_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.memberships (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(community_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id,community_id);
create table app_private.community_moderators (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(community_id,user_id)
);
alter table app_private.community_moderators enable row level security;
create function app_private.can_moderate(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    app_private.is_admin() or exists(select 1 from app_private.community_moderators where community_id=target and user_id=(select auth.uid()))
  );
$$;
revoke all on function app_private.can_moderate(uuid) from public;
grant execute on function app_private.can_moderate(uuid) to anon,authenticated;

-- Check both directions without exposing either member's private block list.
create function app_private.is_blocked(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.blocks b where
    (b.user_id=(select auth.uid()) and b.blocked_id=target) or
    (b.blocked_id=(select auth.uid()) and b.user_id=target));
$$;
revoke all on function app_private.is_blocked(uuid) from public;
grant execute on function app_private.is_blocked(uuid) to anon,authenticated;

create table public.brands (
  id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique,
  description text not null default ''
);
create table public.watch_collections (
  id uuid primary key default gen_random_uuid(), brand_id uuid not null references public.brands(id),
  name text not null, unique(brand_id,name)
);
create table public.watch_models (
  id uuid primary key default gen_random_uuid(), collection_id uuid not null references public.watch_collections(id),
  name text not null, unique(collection_id,name)
);
create table public.movements (
  id uuid primary key default gen_random_uuid(), manufacturer text, calibre text not null,
  mechanism text check(mechanism in ('manual','automatic','quartz','solar','electronic','other')),
  power_reserve_hours numeric check(power_reserve_hours > 0)
);
create table public.watch_references (
  id uuid primary key default gen_random_uuid(), model_id uuid not null references public.watch_models(id),
  reference text not null, description text not null default '', movement_id uuid references public.movements(id),
  diameter_mm numeric check(diameter_mm > 0), thickness_mm numeric check(thickness_mm > 0),
  lug_to_lug_mm numeric check(lug_to_lug_mm > 0), water_resistance_m integer check(water_resistance_m >= 0),
  material text, crystal text, production_from integer, production_to integer,
  review_status text not null default 'pending' check(review_status in ('pending','approved','rejected')),
  unique(model_id,reference), check(production_to is null or production_from is null or production_to >= production_from)
);
create index watch_references_reference_idx on public.watch_references(reference);
create index watch_references_model_idx on public.watch_references(model_id);
create table public.catalog_sources (
  id uuid primary key default gen_random_uuid(), reference_id uuid not null references public.watch_references(id) on delete cascade,
  url text not null check(url ~ '^https://'), title text not null,
  accessed_at timestamptz not null default now(), field_names text[] not null default '{}'
);
create table public.catalog_revisions (
  id uuid primary key default gen_random_uuid(), reference_id uuid references public.watch_references(id),
  contributor_id uuid references public.profiles(id) on delete set null, suggestion jsonb not null,
  source_url text check(source_url ~ '^https://'),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index catalog_revisions_contributor_idx on public.catalog_revisions(contributor_id);

create table public.posts (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id), reference_id uuid references public.watch_references(id),
  title text not null check(char_length(title) between 3 and 240),
  body text not null check(char_length(body) between 1 and 20000),
  kind text not null default 'discussion' check(kind in ('text','photography','discussion','review','question','guide','video','poll')),
  language text not null default 'en' check(language in ('en','pt-BR','es')),
  status text not null default 'published' check(status in ('published','removed','deleted')),
  pinned boolean not null default false,
  created_at timestamptz not null default now(), edited_at timestamptz
);
create index posts_feed_idx on public.posts(community_id,created_at desc) where status='published';
create index posts_author_idx on public.posts(author_id,created_at desc);
create index posts_reference_idx on public.posts(reference_id);
create index posts_search_idx on public.posts using gin(to_tsvector('simple',title || ' ' || body));
create table public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid, body text not null check(char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(), edited_at timestamptz,
  unique(id,post_id), foreign key(parent_id,post_id) references public.comments(id,post_id)
);
create index comments_post_idx on public.comments(post_id,created_at);
create index comments_author_idx on public.comments(author_id);
create table public.votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check(value in (-1,1)), created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);
create index votes_user_idx on public.votes(user_id);
create table public.saved_posts (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(post_id,user_id)
);
create index saved_posts_user_idx on public.saved_posts(user_id);
create table public.media (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null unique, alt_text text not null default '',
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 8388608),
  check(split_part(storage_path,'/',1) = owner_id::text)
);
create index media_post_idx on public.media(post_id);
create index media_owner_idx on public.media(owner_id);

create table public.user_watches (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  reference_id uuid references public.watch_references(id), label text not null check(char_length(label) between 1 and 160),
  status text not null default 'owned' check(status in ('owned','previously-owned','wishlist')),
  visibility text not null default 'private' check(visibility in ('private','public')),
  condition text, strap text, created_at timestamptz not null default now(),
  unique(id,owner_id)
);
create index user_watches_owner_idx on public.user_watches(owner_id,status);
create index user_watches_reference_idx on public.user_watches(reference_id);
create table public.watch_private (
  watch_id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
  serial_number text check(char_length(serial_number) <= 160), acquired_at date,
  acquisition_amount numeric(18,2) check(acquisition_amount >= 0), currency char(3),
  notes text not null default '' check(char_length(notes) <= 10000),
  foreign key(watch_id,owner_id) references public.user_watches(id,owner_id) on delete cascade
);
create index watch_private_owner_idx on public.watch_private(owner_id);
create table public.passports (
  id uuid primary key default gen_random_uuid(), watch_id uuid not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(id,owner_id), foreign key(watch_id,owner_id) references public.user_watches(id,owner_id) on delete cascade
);
create index passports_owner_idx on public.passports(owner_id);
create table public.passport_events (
  id uuid primary key default gen_random_uuid(), passport_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('acquisition','service','maintenance','restoration','strap','component','inspection','valuation','sale')),
  occurred_on date not null, description text not null check(char_length(description) between 1 and 5000),
  verification text not null default 'owner-declared' check(verification in ('owner-declared','documents-presented','partner-verified')),
  created_at timestamptz not null default now(), foreign key(passport_id,owner_id) references public.passports(id,owner_id) on delete cascade
);
create index passport_events_timeline_idx on public.passport_events(passport_id,occurred_on desc);
create index passport_events_owner_idx on public.passport_events(owner_id);
create table public.passport_documents (
  id uuid primary key default gen_random_uuid(), passport_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique, file_name text not null check(char_length(file_name) between 1 and 240),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key(passport_id,owner_id) references public.passports(id,owner_id) on delete cascade,
  check(split_part(storage_path,'/',1)=owner_id::text),
  check(split_part(storage_path,'/',2)=passport_id::text)
);
create index passport_documents_owner_idx on public.passport_documents(owner_id);
create index passport_documents_passport_idx on public.passport_documents(passport_id);

create table public.reputation_rules (
  code text primary key, points integer not null check(points between 1 and 100),
  daily_limit integer not null check(daily_limit between 1 and 50), active boolean not null default true
);
create table public.reputation_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  rule_code text not null references public.reputation_rules(code),
  points integer not null check(points between -100 and 100 and points <> 0),
  evidence_key text not null, reverses_id uuid unique references public.reputation_events(id),
  granted_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
  unique(user_id,rule_code,evidence_key)
);
create index reputation_events_user_idx on public.reputation_events(user_id,created_at desc);
create table public.reputation_levels (
  id integer primary key, name text not null unique, threshold integer not null unique check(threshold>=0)
);
create table public.badges (
  id uuid primary key default gen_random_uuid(), name text not null unique, criteria text not null
);
create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id), awarded_at timestamptz not null default now(),
  primary key(user_id,badge_id)
);
create table public.subscription_plans (
  id text primary key, name text not null, active boolean not null default false
);
create table public.entitlement_definitions (
  code text primary key, description text not null
);
create table public.plan_entitlements (
  plan_id text not null references public.subscription_plans(id),
  entitlement_code text not null references public.entitlement_definitions(code),
  primary key(plan_id,entitlement_code)
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null check(status in ('trial','active','past_due','cancelled','expired')),
  current_period_end timestamptz, created_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions(user_id);
create table public.billing_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null,
  external_event_id text not null unique, event_type text not null, received_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, title text not null, path text, read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text not null check(char_length(reason) between 5 and 2000),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(), unique(reporter_id,post_id)
);
create index reports_post_idx on public.reports(post_id);
create index reports_reporter_idx on public.reports(reporter_id);
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null, action text not null,
  created_at timestamptz not null default now()
);
create table public.editorial_content (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  author_id uuid references public.profiles(id) on delete set null, title text not null,
  body text not null, language text not null check(language in ('en','pt-BR','es')),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  reference_id uuid references public.watch_references(id), meta_description text,
  published_at timestamptz, created_at timestamptz not null default now()
);
create index editorial_published_idx on public.editorial_content(published_at desc) where status='published';
create table app_private.audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid, entity text not null,
  entity_id text, operation text not null, created_at timestamptz not null default now()
);
alter table app_private.audit_log enable row level security;

-- Deny by default for every public table, including future-only modules.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename = any(array['profiles','profile_private','follows','blocks','communities','memberships','brands','watch_collections','watch_models','movements','watch_references','catalog_sources','catalog_revisions','posts','comments','votes','saved_posts','media','user_watches','watch_private','passports','passport_events','passport_documents','reputation_rules','reputation_events','reputation_levels','badges','user_badges','subscription_plans','entitlement_definitions','plan_entitlements','subscriptions','billing_events','notifications','reports','moderation_actions','editorial_content']) loop
    execute format('alter table public.%I enable row level security',t.tablename);
    execute format('revoke all on public.%I from anon, authenticated',t.tablename);
  end loop;
end $$;

-- Public editorial/catalog/community reads contain no private ownership data.
do $$ declare n text; begin
  foreach n in array array['profiles','communities','brands','watch_collections','watch_models','movements','reputation_rules','reputation_levels','badges','user_badges','subscription_plans','entitlement_definitions','plan_entitlements'] loop
    execute format('grant select on public.%I to anon, authenticated',n);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)',n);
  end loop;
end $$;
grant select on public.watch_references,public.catalog_sources to anon,authenticated;
create policy reference_read on public.watch_references for select to anon,authenticated using(review_status='approved' or (select app_private.is_admin()));
create policy source_read on public.catalog_sources for select to anon,authenticated using(exists(select 1 from public.watch_references r where r.id=reference_id and r.review_status='approved'));
grant update(username,display_name,bio,country,locale,avatar_path,collection_public) on public.profiles to authenticated;
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

-- Public visibility also observes profile-level collection privacy.
grant select on public.user_watches to anon,authenticated;
create policy watch_read on public.user_watches for select to anon,authenticated using(owner_id=(select auth.uid()) or (visibility='public' and exists(select 1 from public.profiles p where p.id=owner_id and p.collection_public)));
grant insert,delete on public.user_watches to authenticated;
grant update(label,status,visibility,condition,strap,reference_id) on public.user_watches to authenticated;
create policy watch_insert on public.user_watches for insert to authenticated with check(owner_id=(select auth.uid()));
create policy watch_update on public.user_watches for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy watch_delete on public.user_watches for delete to authenticated using(owner_id=(select auth.uid()));

-- Owner-only records: no administrator override for personal documents or serials.
do $$ declare n text; col text; begin
  foreach n in array array['profile_private','watch_private','passports','passport_events','passport_documents','saved_posts','blocks'] loop
    col := case when n='profile_private' or n='saved_posts' or n='blocks' then 'user_id' else 'owner_id' end;
    execute format('grant select,insert,delete on public.%I to authenticated',n);
    execute format('create policy owner_read on public.%I for select to authenticated using (%I=(select auth.uid()))',n,col);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (%I=(select auth.uid()))',n,col);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (%I=(select auth.uid()))',n,col);
  end loop;
end $$;
grant update on public.profile_private,public.watch_private to authenticated;
create policy profile_private_update on public.profile_private for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy watch_private_update on public.watch_private for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- Prevent self-attestation of partner verification even through the raw Data API.
drop policy owner_insert on public.passport_events;
create policy event_insert on public.passport_events for insert to authenticated with check(owner_id=(select auth.uid()) and verification='owner-declared');
-- Passport transfer intentionally unavailable: owner IDs have no UPDATE grants.

grant select on public.posts,public.comments,public.media,public.votes to anon,authenticated;
create policy post_read on public.posts for select to anon,authenticated using((status='published' and exists(select 1 from public.communities c where c.id=community_id and c.is_public)) or author_id=(select auth.uid()) or app_private.can_moderate(community_id));
create policy comment_read on public.comments for select to anon,authenticated using(exists(select 1 from public.posts p where p.id=post_id));
create policy media_read on public.media for select to anon,authenticated using(exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
create policy vote_read on public.votes for select to anon,authenticated using(exists(select 1 from public.posts p where p.id=post_id and p.status='published'));
grant select,insert,delete on public.memberships to authenticated;
create policy membership_read on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy membership_insert on public.memberships for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.communities c where c.id=community_id and c.is_public));
create policy membership_delete on public.memberships for delete to authenticated using(user_id=(select auth.uid()));

-- Serialize per-user publishing to avoid races in the database-backed rate limit.
create function app_private.check_post_insert() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or new.author_id <> (select auth.uid()) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.author_id::text,0));
  if (select count(*) from public.posts where author_id=new.author_id and created_at > now()-interval '1 minute') >= 5 then
    raise exception 'Publishing rate limit reached' using errcode='P0001';
  end if;
  new.created_at := now(); new.edited_at := null; new.pinned := false; new.status := 'published';
  return new;
end;
$$;
revoke all on function app_private.check_post_insert() from public,anon,authenticated;
create trigger post_insert_guard before insert on public.posts for each row execute function app_private.check_post_insert();
grant insert on public.posts to authenticated;
grant update(title,body,edited_at,status,pinned) on public.posts to authenticated;
create policy post_insert on public.posts for insert to authenticated with check(author_id=(select auth.uid()) and status='published' and not pinned and exists(select 1 from public.memberships m where m.community_id=posts.community_id and m.user_id=(select auth.uid())));
create policy post_owner_update on public.posts for update to authenticated using(author_id=(select auth.uid()) and status='published') with check(author_id=(select auth.uid()) and status in ('published','deleted') and not pinned);
create policy post_mod_update on public.posts for update to authenticated using(app_private.can_moderate(community_id)) with check(app_private.can_moderate(community_id));

grant insert,delete on public.comments to authenticated;
grant update(body,edited_at) on public.comments to authenticated;
create policy comment_insert on public.comments for insert to authenticated with check(author_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.status='published') and not exists(select 1 from public.posts p where p.id=post_id and app_private.is_blocked(p.author_id)));
create policy comment_update on public.comments for update to authenticated using(author_id=(select auth.uid())) with check(author_id=(select auth.uid()));
create policy comment_delete on public.comments for delete to authenticated using(author_id=(select auth.uid()));
grant insert,delete on public.votes to authenticated;
grant update(value) on public.votes to authenticated;
create policy vote_insert on public.votes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.status='published' and p.author_id<>(select auth.uid()) and not app_private.is_blocked(p.author_id)));
create policy vote_update on public.votes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy vote_delete on public.votes for delete to authenticated using(user_id=(select auth.uid()));

-- Only update the vote's value during conflict resolution; immutable identity
-- columns are never granted UPDATE permission to browser roles.
create function public.cast_vote(p_post_id uuid,p_value smallint) returns setof public.votes
language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_value=0 then
    return query delete from public.votes where post_id=p_post_id and user_id=(select auth.uid()) returning *;
  elsif p_value in (-1,1) then
    return query insert into public.votes(post_id,user_id,value) values(p_post_id,(select auth.uid()),p_value)
      on conflict(post_id,user_id) do update set value=excluded.value returning *;
  else raise exception 'Invalid vote' using errcode='22023'; end if;
end;
$$;
revoke all on function public.cast_vote(uuid,smallint) from public,anon;
grant execute on function public.cast_vote(uuid,smallint) to authenticated;

grant insert,delete on public.media to authenticated;
create policy media_insert on public.media for insert to authenticated with check(owner_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.author_id=(select auth.uid())));
create policy media_delete on public.media for delete to authenticated using(owner_id=(select auth.uid()));

grant select,insert,delete on public.follows to authenticated;
create policy follows_read on public.follows for select to authenticated using(follower_id=(select auth.uid()) or followed_id=(select auth.uid()));
create policy follows_insert on public.follows for insert to authenticated with check(follower_id=(select auth.uid()) and not app_private.is_blocked(followed_id));
create policy follows_delete on public.follows for delete to authenticated using(follower_id=(select auth.uid()));
grant select,insert on public.catalog_revisions to authenticated;
create policy revision_read on public.catalog_revisions for select to authenticated using(contributor_id=(select auth.uid()) or (select app_private.is_admin()));
create policy revision_insert on public.catalog_revisions for insert to authenticated with check(contributor_id=(select auth.uid()) and status='pending');
grant select on public.reputation_events,public.subscriptions to authenticated;
create policy reputation_owner_read on public.reputation_events for select to authenticated using(user_id=(select auth.uid()));
create policy subscription_owner_read on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
-- No user INSERT/UPDATE on reputation, badges, billing or entitlements.
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy notification_read on public.notifications for select to authenticated using(recipient_id=(select auth.uid()));
create policy notification_update on public.notifications for update to authenticated using(recipient_id=(select auth.uid())) with check(recipient_id=(select auth.uid()));
grant select,insert on public.reports to authenticated;
grant update(status) on public.reports to authenticated;
create policy report_read on public.reports for select to authenticated using(reporter_id=(select auth.uid()) or (select app_private.is_admin()));
create policy report_insert on public.reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='open');
create policy report_mod_update on public.reports for update to authenticated using((select app_private.is_admin())) with check((select app_private.is_admin()));
grant select on public.moderation_actions to authenticated;
create policy moderation_read on public.moderation_actions for select to authenticated using((select app_private.is_admin()));
grant select on public.editorial_content to anon,authenticated;
create policy editorial_read on public.editorial_content for select to anon,authenticated using(status='published' or (select app_private.is_admin()));

-- Auditing stores identifiers/operations, never entire private document/serial contents.
create function app_private.audit_post_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into app_private.audit_log(actor_id,entity,entity_id,operation) values((select auth.uid()),'posts',new.id::text,'update');
  if new.status is distinct from old.status or new.pinned is distinct from old.pinned then
    insert into public.moderation_actions(actor_id,post_id,action) values((select auth.uid()),new.id,'status:'||new.status||',pinned:'||new.pinned::text);
  end if;
  return new;
end;
$$;
revoke all on function app_private.audit_post_change() from public,anon,authenticated;
create trigger audit_post_update after update on public.posts for each row execute function app_private.audit_post_change();

-- Trigger is the only automatic privileged bootstrap. Metadata only supplies display name.
create function app_private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,username,display_name)
  values(new.id,replace(new.id::text,'-',''),left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Horion member'),80));
  insert into public.profile_private(user_id) values(new.id);
  return new;
end;
$$;
revoke all on function app_private.handle_new_user() from public,anon,authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function app_private.handle_new_user();

-- Buckets are explicit; documents are NEVER public. File replacement is intentionally disabled.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('passport-documents','passport-documents',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']),
       ('post-media','post-media',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy passport_file_read on storage.objects for select to authenticated using(bucket_id='passport-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.passports p where p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid())));
create policy passport_file_insert on storage.objects for insert to authenticated with check(bucket_id='passport-documents' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.passports p where p.id::text=(storage.foldername(name))[2] and p.owner_id=(select auth.uid())));
create policy passport_file_delete on storage.objects for delete to authenticated using(bucket_id='passport-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy post_file_read on storage.objects for select to anon,authenticated using(bucket_id='post-media' and exists(select 1 from public.media m join public.posts p on p.id=m.post_id where m.storage_path=storage.objects.name and p.status='published'));
create policy post_file_insert on storage.objects for insert to authenticated with check(bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy post_file_delete on storage.objects for delete to authenticated using(bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

comment on table public.passports is 'Owner-controlled record, not proof of authenticity or ownership. Transfer disabled pending consent and dispute design.';
comment on table public.reputation_events is 'Trusted backend writes only. Billing and raw activity never grant reputation.';
comment on table public.watch_private is 'Serials, prices, acquisition dates and notes remain owner-only even for public collections.';

commit;
