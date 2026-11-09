begin;
-- Follow-up for the live Horion namespaces only. The shared foundation is already
-- applied; never rewrite it or touch existing Rango/Auth/Storage definitions.

-- Cover every column of the composite FK, preserving the existing indexes.
create index passport_documents_passport_owner_idx on horion.passport_documents(passport_id,owner_id);
create index passport_events_passport_owner_idx on horion.passport_events(passport_id,owner_id);
create index passports_watch_owner_idx on horion.passports(watch_id,owner_id);
create index reputation_events_reversal_user_idx on horion.reputation_events(reverses_id,user_id);
create index watch_private_watch_owner_idx on horion.watch_private(watch_id,owner_id);

-- PostgreSQL OR-composes permissive policies for the same command. Combine the
-- original owner/moderator rules explicitly so each check has one policy while
-- preserving the original USING and WITH CHECK semantics exactly.
drop policy post_owner_update on horion.posts;
drop policy post_mod_update on horion.posts;
create policy post_update on horion.posts for update to authenticated
  using (
    (author_id=(select auth.uid()) and status='published')
    or horion_private.can_moderate(community_id)
  )
  with check (
    (author_id=(select auth.uid()) and status in ('published','deleted') and not pinned)
    or horion_private.can_moderate(community_id)
  );
commit;
