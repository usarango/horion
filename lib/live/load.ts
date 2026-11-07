import { emptyLiveState, type LiveClient, type LiveState } from './types';
import {
  mapCommunity,
  mapPassport,
  mapPost,
  mapProfile,
  mapReference,
  mapWatch,
  rows,
  text,
  type DatabaseRow,
} from './mappers';

type QueryResult = { data: unknown; error: { message?: string; code?: string } | null };
const PROFILE_FIELDS =
  'id,username,display_name,bio,country,locale,account_type,website,contact_email,created_at';
const POST_FIELDS =
  '*,profiles!posts_author_id_fkey(id,username,display_name),communities(id,slug,name)';

async function query(request: PromiseLike<QueryResult>, resource: string): Promise<unknown> {
  const result = await request;
  if (result.error)
    throw new Error(`Could not load ${resource}. Check your connection and try again.`);
  return result.data;
}
async function list(request: PromiseLike<QueryResult>, resource: string) {
  return rows(await query(request, resource));
}

/** Aggregate whole result pages so visible vote totals and reply trees are not truncated. */
async function completeRows(
  makeRequest: (from: number, to: number) => PromiseLike<QueryResult>,
  resource: string
): Promise<DatabaseRow[]> {
  const result: DatabaseRow[] = [];
  const size = 500;
  for (let page = 0; page < 40; page++) {
    const chunk = await list(makeRequest(page * size, (page + 1) * size - 1), resource);
    result.push(...chunk);
    if (chunk.length < size) return result;
  }
  throw new Error(`This ${resource} result is too large to load safely. Try a smaller feed.`);
}

/** Every record comes from the current JWT and PostgreSQL RLS; no demo fallback. */
export async function loadLiveState(
  client: LiveClient,
  options: { signupEnabled: boolean }
): Promise<LiveState> {
  const state = emptyLiveState(true, options.signupEnabled);
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError')
    throw new Error('Could not verify your session. Please try signing in again.');
  const [communityRows, profileRows, referenceRows, feedRows, ownProfile] = await Promise.all([
    list(
      client
        .from('communities')
        .select('id,slug,name,description,is_public')
        .eq('is_public', true)
        .order('name')
        .limit(100),
      'communities'
    ),
    list(
      client
        .from('profiles')
        .select(PROFILE_FIELDS)
        .order('created_at', { ascending: false })
        .limit(100),
      'member profiles'
    ),
    list(
      client
        .from('watch_references')
        .select(
          'id,reference,watch_models(name,watch_collections(name,brands(name))),movements(calibre),catalog_sources(url,title)'
        )
        .eq('review_status', 'approved')
        .order('reference')
        .limit(100),
      'watch references'
    ),
    list(
      client
        .from('posts')
        .select(POST_FIELDS)
        .in('status', ['published', 'removed'])
        .order('created_at', { ascending: false })
        .limit(50),
      'posts'
    ),
    user
      ? query(
          client.from('profiles').select(PROFILE_FIELDS).eq('id', user.id).maybeSingle(),
          'your profile'
        )
      : Promise.resolve(null),
  ]);
  state.communities = communityRows.map(mapCommunity);
  state.members = profileRows.map(mapProfile);
  state.references = referenceRows.map(mapReference);
  const memberRow =
    ownProfile && typeof ownProfile === 'object' && !Array.isArray(ownProfile)
      ? (ownProfile as DatabaseRow)
      : null;
  const member = memberRow ? mapProfile(memberRow) : null;
  if (member && !state.members.some((profile) => profile.id === member.id))
    state.members.unshift(member);
  state.auth = {
    ...state.auth,
    user: user ? { id: user.id, email: user.email } : null,
    member,
    status: member ? 'member' : user ? 'onboarding' : 'guest',
  };
  if (member) state.profile = member;

  let savedRows: DatabaseRow[] = [];
  if (member && user) {
    const [role, moderated, memberships, saved, watches, passports, notifications, reports] =
      await Promise.all([
        query(client.rpc('get_my_role'), 'your permissions'),
        query(client.rpc('get_my_moderated_communities'), 'your moderation permissions'),
        list(
          client.from('memberships').select('community_id').eq('user_id', user.id).limit(500),
          'your communities'
        ),
        list(
          client.from('saved_posts').select('post_id').eq('user_id', user.id).limit(500),
          'your saved posts'
        ),
        list(
          client
            .from('user_watches')
            .select('*,watch_private(notes,acquired_at)')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500),
          'your collection'
        ),
        list(
          client
            .from('passports')
            .select('*,passport_events(*)')
            .eq('owner_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500),
          'your passports'
        ),
        list(
          client
            .from('notifications')
            .select('id,title,read_at')
            .eq('recipient_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100),
          'your notifications'
        ),
        list(
          client
            .from('reports')
            .select('id,post_id,reason,status')
            .order('created_at', { ascending: false })
            .limit(100),
          'authorized reports'
        ),
      ]);
    if (!['member', 'moderator', 'admin', 'editor'].includes(String(role)))
      throw new Error('Your membership permissions could not be confirmed.');
    if (!Array.isArray(moderated) || !moderated.every((id) => typeof id === 'string'))
      throw new Error('Your moderation permissions could not be confirmed.');
    state.auth.role = role as typeof state.auth.role;
    state.auth.moderatedCommunityIds = moderated;
    const clubsById = new Map(state.communities.map((community) => [community.id, community]));
    state.joined = memberships
      .map((item) => clubsById.get(text(item.community_id))?.slug)
      .filter((slug): slug is string => !!slug);
    savedRows = saved;
    state.watches = watches.map((item) => mapWatch(item, state.references));
    state.passports = passports.map(mapPassport);
    state.notifications = notifications.map((item) => ({
      id: text(item.id),
      title: text(item.title),
      read: !!item.read_at,
    }));
    state.reports = reports.map((item) => ({
      id: text(item.id),
      postId: text(item.post_id),
      reason: text(item.reason),
      status: item.status === 'open' ? 'open' : 'resolved',
    }));
    const missingReportPosts = [...new Set(reports.map((item) => text(item.post_id)))].filter(
      (id) => id && !feedRows.some((post) => post.id === id)
    );
    if (missingReportPosts.length)
      feedRows.push(
        ...(await list(
          client.from('posts').select(POST_FIELDS).in('id', missingReportPosts),
          'reported posts'
        ))
      );
  }

  if (!feedRows.length) return state;
  const postIds = feedRows.map((post) => text(post.id));
  const [comments, votes, media] = await Promise.all([
    completeRows(
      (from, to) =>
        client
          .from('comments')
          .select('*,profiles!comments_author_id_fkey(id,username,display_name)')
          .in('post_id', postIds)
          .order('created_at')
          .range(from, to),
      'comments'
    ),
    completeRows(
      (from, to) =>
        client
          .from('votes')
          .select('post_id,user_id,value')
          .in('post_id', postIds)
          .order('post_id')
          .order('user_id')
          .range(from, to),
      'votes'
    ),
    list(
      client
        .from('media')
        .select('post_id,storage_path')
        .in('post_id', postIds)
        .order('id')
        .limit(500),
      'post images'
    ),
  ]);
  const firstImageByPost = new Map<string, string>();
  for (const mediaRow of media)
    if (!firstImageByPost.has(text(mediaRow.post_id)))
      firstImageByPost.set(text(mediaRow.post_id), text(mediaRow.storage_path));
  const images = new Map<string, string>();
  if (firstImageByPost.size) {
    const { data, error } = await client.storage
      .from('horion-post-media')
      .createSignedUrls([...firstImageByPost.values()], 300);
    if (error || !data || data.some((item) => item.error || !item.signedUrl))
      throw new Error('Could not authorize the post images. Please refresh the feed.');
    for (const [postId, storagePath] of firstImageByPost) {
      const image = data.find((item) => item.path === storagePath);
      if (!image?.signedUrl) throw new Error('A post image could not be authorized.');
      images.set(postId, image.signedUrl);
    }
  }
  const context = {
    profiles: new Map(state.members.map((profile) => [profile.id, profile])),
    communities: new Map(state.communities.map((community) => [community.id, community])),
    comments,
    votes,
    savedIds: new Set(savedRows.map((item) => text(item.post_id))),
    images,
    userId: user?.id,
  };
  state.posts = feedRows.map((post) => mapPost(post, context));
  return state;
}
