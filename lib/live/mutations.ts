import { z } from 'zod';
import { detectFileType } from '../supabase/upload-validation';
import type { PassportEventInput, PostInput, Profile, UserWatch, WatchReference } from '../domain';
import type {
  CatalogSuggestion,
  CommunityInput,
  LiveClient,
  ManualWatchInput,
  OnboardingInput,
} from './types';

const uuid = z.string().uuid();
const username = z.string().regex(/^[a-z0-9_]{3,32}$/);
const status = z.enum(['owned', 'previously-owned', 'wishlist']);
const visibility = z.enum(['private', 'public']);
const website = z
  .union([
    z.literal(''),
    z
      .url()
      .max(500)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      }),
  ])
  .optional();
const contact = z.union([z.literal(''), z.email().max(254)]).optional();

export function assertResult<T>(
  result: { data: T; error: { code?: string; message?: string } | null },
  operation: string
): T {
  if (result.error) {
    const suffix =
      result.error.code === '23505'
        ? ' This record already exists or its name is unavailable.'
        : result.error.code === '42501'
          ? ' Your account does not have permission.'
          : result.error.code === 'P0001'
            ? ' Please wait before trying again.'
            : '';
    throw new Error(`${operation}${suffix}`);
  }
  return result.data;
}

export function parsePhoto(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[2].length > 11_184_812)
    throw new Error('Choose a JPEG, PNG or WebP image up to 8 MB.');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The image could not be read.');
  }
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || detectFileType(bytes) !== match[1])
    throw new Error('The image contents do not match the selected file type.');
  return { bytes, contentType: match[1] };
}

export async function publishLivePost(
  client: LiveClient,
  ownerId: string,
  communityId: string,
  input: PostInput
) {
  uuid.parse(ownerId);
  uuid.parse(communityId);
  const fields = z
    .object({
      title: z.string().trim().min(3).max(240),
      body: z.string().trim().min(1).max(20000),
      type: z.enum(['Photography', 'Discussion', 'Review', 'Question']),
      language: z.enum(['en', 'pt-BR', 'es']),
    })
    .parse(input);
  const photo = input.image ? parsePhoto(input.image) : null;
  const inserted = assertResult(
    await client
      .from('posts')
      .insert({
        author_id: ownerId,
        community_id: communityId,
        title: fields.title,
        body: fields.body,
        kind: fields.type.toLowerCase(),
        language: fields.language,
        status: 'published',
      })
      .select('id')
      .single(),
    'Unable to publish your post.'
  );
  if (!inserted?.id) throw new Error('The new post could not be confirmed.');
  if (!photo) return;
  const storage = client.storage.from('horion-post-media');
  const path = `${ownerId}/${inserted.id}/${crypto.randomUUID()}`;
  try {
    assertResult(
      await storage.upload(path, photo.bytes, { contentType: photo.contentType, upsert: false }),
      'Unable to upload the photograph.'
    );
    assertResult(
      await client
        .from('media')
        .insert({
          owner_id: ownerId,
          post_id: inserted.id,
          storage_path: path,
          alt_text: fields.title,
          mime_type: photo.contentType,
          size_bytes: photo.bytes.length,
        })
        .select('id')
        .single(),
      'Unable to attach the photograph.'
    );
  } catch (error) {
    await storage.remove([path]);
    const rollback = await client
      .from('posts')
      .update({ status: 'deleted' })
      .eq('id', inserted.id)
      .eq('author_id', ownerId)
      .select('id')
      .single();
    if (rollback.error)
      throw new Error(
        'The photograph failed and the post may have been saved without it. Refresh before retrying.'
      );
    throw error;
  }
}

export async function editLivePost(
  client: LiveClient,
  ownerId: string,
  id: string,
  patch: { title: string; body: string }
) {
  uuid.parse(id);
  const data = z
    .object({ title: z.string().trim().min(3).max(240), body: z.string().trim().min(1).max(20000) })
    .parse(patch);
  assertResult(
    await client
      .from('posts')
      .update({ ...data, edited_at: new Date().toISOString() })
      .eq('id', id)
      .eq('author_id', ownerId)
      .select('id')
      .single(),
    'Unable to update this post.'
  );
}
export async function deleteLivePost(client: LiveClient, ownerId: string, id: string) {
  uuid.parse(id);
  assertResult(
    await client
      .from('posts')
      .update({ status: 'deleted' })
      .eq('id', id)
      .eq('author_id', ownerId)
      .select('id')
      .single(),
    'Unable to delete this post.'
  );
}
export async function commentLivePost(
  client: LiveClient,
  ownerId: string,
  postId: string,
  body: string,
  parentId?: string
) {
  uuid.parse(postId);
  if (parentId) uuid.parse(parentId);
  const text = z.string().trim().min(1).max(5000).parse(body);
  assertResult(
    await client
      .from('comments')
      .insert({ post_id: postId, author_id: ownerId, body: text, parent_id: parentId || null })
      .select('id')
      .single(),
    'Unable to add your comment.'
  );
}
export async function voteLivePost(
  client: LiveClient,
  ownerId: string,
  postId: string,
  value: 1 | -1 | 0
) {
  uuid.parse(postId);
  const result =
    value === 0
      ? await client.from('votes').delete().eq('post_id', postId).eq('user_id', ownerId)
      : await client
          .from('votes')
          .upsert({ post_id: postId, user_id: ownerId, value }, { onConflict: 'post_id,user_id' });
  assertResult(result, 'Unable to save your vote.');
}
export async function saveLivePost(
  client: LiveClient,
  ownerId: string,
  postId: string,
  saved: boolean
) {
  uuid.parse(postId);
  assertResult(
    saved
      ? await client
          .from('saved_posts')
          .upsert({ post_id: postId, user_id: ownerId }, { onConflict: 'post_id,user_id' })
      : await client.from('saved_posts').delete().eq('post_id', postId).eq('user_id', ownerId),
    'Unable to update saved posts.'
  );
}
export async function joinLiveCommunity(
  client: LiveClient,
  ownerId: string,
  communityId: string,
  joined: boolean
) {
  uuid.parse(communityId);
  assertResult(
    joined
      ? await client
          .from('memberships')
          .upsert(
            { community_id: communityId, user_id: ownerId },
            { onConflict: 'community_id,user_id' }
          )
      : await client
          .from('memberships')
          .delete()
          .eq('community_id', communityId)
          .eq('user_id', ownerId),
    'Unable to update your community membership.'
  );
}
export async function createLiveCommunity(client: LiveClient, input: CommunityInput) {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      slug: z.string().regex(/^[a-z0-9-]{2,64}$/),
      description: z.string().trim().max(2000),
      rules: z.string().trim().max(10000).optional(),
    })
    .parse(input);
  assertResult(
    await client.rpc('create_community', {
      p_name: data.name,
      p_slug: data.slug,
      p_description: data.description,
      p_rules: data.rules || '',
    }),
    'Unable to create the community.'
  );
}

export async function addLiveWatch(
  client: LiveClient,
  ownerId: string,
  input: ManualWatchInput,
  reference?: WatchReference
) {
  const data = z
    .object({
      label: z.string().trim().min(1).max(160),
      brand: z.string().trim().max(100).optional(),
      model: z.string().trim().max(160).optional(),
      referenceText: z.string().trim().max(160).optional(),
      status,
      visibility: visibility.default('private'),
      notes: z.string().trim().max(10000).optional(),
    })
    .parse(input);
  const watch = assertResult(
    await client
      .from('user_watches')
      .insert({
        owner_id: ownerId,
        reference_id: reference?.id || null,
        label: data.label,
        brand_name: data.brand || null,
        model_name: data.model || null,
        reference_label: data.referenceText || null,
        status: data.status,
        visibility: data.visibility,
      })
      .select('id')
      .single(),
    'Unable to add your watch.'
  );
  if (!watch?.id) throw new Error('The watch record could not be confirmed.');
  if (data.notes) {
    const result = await client
      .from('watch_private')
      .insert({ watch_id: watch.id, owner_id: ownerId, notes: data.notes });
    if (result.error) {
      const rollback = await client
        .from('user_watches')
        .delete()
        .eq('id', watch.id)
        .eq('owner_id', ownerId);
      if (rollback.error)
        throw new Error(
          'The watch was saved, but private notes could not be recorded. Refresh before retrying.'
        );
      assertResult(result, 'Unable to save private watch notes.');
    }
  }
}

export type WatchPatch = Partial<
  Pick<
    UserWatch,
    'status' | 'notes' | 'acquiredAt' | 'visibility' | 'label' | 'brand' | 'model' | 'referenceText'
  >
>;
export async function updateLiveWatch(
  client: LiveClient,
  ownerId: string,
  id: string,
  patch: WatchPatch
) {
  uuid.parse(id);
  const data = z
    .object({
      status: status.optional(),
      visibility: visibility.optional(),
      notes: z.string().trim().max(10000).optional(),
      acquiredAt: z.union([z.literal(''), z.iso.date()]).optional(),
      label: z.string().trim().min(1).max(160).optional(),
      brand: z.string().trim().max(100).optional(),
      model: z.string().trim().max(160).optional(),
      referenceText: z.string().trim().max(160).optional(),
    })
    .parse(patch);
  const publicFields = {
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    ...(data.label !== undefined ? { label: data.label } : {}),
    ...(data.brand !== undefined ? { brand_name: data.brand || null } : {}),
    ...(data.model !== undefined ? { model_name: data.model || null } : {}),
    ...(data.referenceText !== undefined ? { reference_label: data.referenceText || null } : {}),
  };
  if (Object.keys(publicFields).length)
    assertResult(
      await client
        .from('user_watches')
        .update(publicFields)
        .eq('id', id)
        .eq('owner_id', ownerId)
        .select('id')
        .single(),
      'Unable to update your watch.'
    );
  if (data.notes !== undefined || data.acquiredAt !== undefined)
    assertResult(
      await client.from('watch_private').upsert(
        {
          watch_id: id,
          owner_id: ownerId,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.acquiredAt !== undefined ? { acquired_at: data.acquiredAt || null } : {}),
        },
        { onConflict: 'watch_id' }
      ),
      'Private watch details could not be saved. Other changes may already be saved; refresh before retrying.'
    );
}
export async function createLivePassport(client: LiveClient, ownerId: string, watchId: string) {
  uuid.parse(watchId);
  assertResult(
    await client
      .from('passports')
      .insert({ watch_id: watchId, owner_id: ownerId })
      .select('id')
      .single(),
    'Unable to create your passport.'
  );
}
const eventTypes: Record<string, string> = {
  Acquisition: 'acquisition',
  Maintenance: 'maintenance',
  Service: 'service',
  Restoration: 'restoration',
  'Strap change': 'strap',
  'Component replacement': 'component',
  Inspection: 'inspection',
  Valuation: 'valuation',
  Sale: 'sale',
};
export async function addLivePassportEvent(
  client: LiveClient,
  ownerId: string,
  passportId: string,
  input: PassportEventInput
) {
  uuid.parse(passportId);
  const eventType = z
    .enum([
      'acquisition',
      'service',
      'maintenance',
      'restoration',
      'strap',
      'component',
      'inspection',
      'valuation',
      'sale',
    ])
    .parse(eventTypes[input.type] || input.type);
  const date = z.iso.date().parse(input.date);
  const description = z.string().trim().min(1).max(5000).parse(input.description);
  assertResult(
    await client
      .from('passport_events')
      .insert({
        owner_id: ownerId,
        passport_id: passportId,
        event_type: eventType,
        occurred_on: date,
        description,
        verification: 'owner-declared',
      })
      .select('id')
      .single(),
    'Unable to record the passport event.'
  );
}
export async function updateLiveProfile(client: LiveClient, ownerId: string, input: Profile) {
  const data = z
    .object({
      name: z.string().trim().min(1).max(80),
      username,
      bio: z.string().trim().max(1200),
      country: z.string().trim().max(80),
      accountType: z.enum(['member', 'store']).optional(),
      website,
      contact,
    })
    .parse(input);
  assertResult(
    await client
      .from('profiles')
      .update({
        display_name: data.name,
        username: data.username,
        bio: data.bio,
        country: data.country || null,
        ...(data.accountType ? { account_type: data.accountType } : {}),
        ...(data.website !== undefined ? { website: data.website || null } : {}),
        ...(data.contact !== undefined ? { contact_email: data.contact || null } : {}),
      })
      .eq('id', ownerId)
      .select('id')
      .single(),
    'Unable to update your profile.'
  );
}
export async function onboardLiveMember(client: LiveClient, input: OnboardingInput) {
  const data = z
    .object({
      username,
      displayName: z.string().trim().min(1).max(80),
      locale: z.enum(['en', 'pt-BR']),
      accountType: z.enum(['member', 'store']),
      website,
      contact,
    })
    .parse(input);
  assertResult(
    await client.rpc('onboard_member', {
      p_username: data.username,
      p_display_name: data.displayName,
      p_locale: data.locale,
      p_account_type: data.accountType,
      p_website: data.website || null,
      p_contact_email: data.contact || null,
    }),
    'Unable to create your Horion profile.'
  );
}
export async function reportLivePost(
  client: LiveClient,
  ownerId: string,
  id: string,
  reason: string
) {
  uuid.parse(id);
  assertResult(
    await client
      .from('reports')
      .insert({
        reporter_id: ownerId,
        post_id: id,
        reason: z.string().trim().min(5).max(2000).parse(reason),
        status: 'open',
      })
      .select('id')
      .single(),
    'Unable to submit your report.'
  );
}
export async function moderateLivePost(client: LiveClient, id: string) {
  uuid.parse(id);
  // PostgreSQL checks trusted moderation scope and atomically removes the post,
  // resolves its reports and records the moderation action.
  assertResult(
    await client.rpc('moderate_reported_post', { p_post_id: id }),
    'Unable to moderate this post.'
  );
}
export async function setLiveMemberRole(
  client: LiveClient,
  userId: string,
  role: 'member' | 'moderator'
) {
  uuid.parse(userId);
  const value = z.enum(['member', 'moderator']).parse(role);
  // The RPC independently verifies the current administrator in PostgreSQL.
  assertResult(
    await client.rpc('set_member_role', { p_user_id: userId, p_role: value }),
    'Unable to change this member’s role.'
  );
}
export async function readLiveNotifications(client: LiveClient, ownerId: string) {
  assertResult(
    await client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', ownerId)
      .is('read_at', null),
    'Unable to mark notifications as read.'
  );
}
export async function suggestLiveReference(
  client: LiveClient,
  ownerId: string,
  input: CatalogSuggestion
) {
  const data = z
    .object({
      brand: z.string().trim().min(1).max(100),
      model: z.string().trim().min(1).max(160),
      reference: z.string().trim().min(1).max(160),
      sourceUrl: z
        .url()
        .max(2000)
        .refine(
          (value) =>
            value.startsWith('https://') && !new URL(value).username && !new URL(value).password
        ),
      notes: z.string().trim().max(3000).optional(),
    })
    .parse(input);
  assertResult(
    await client
      .from('catalog_revisions')
      .insert({
        contributor_id: ownerId,
        reference_id: null,
        suggestion: {
          brand: data.brand,
          model: data.model,
          reference: data.reference,
          notes: data.notes || '',
        },
        source_url: data.sourceUrl,
        status: 'pending',
      })
      .select('id')
      .single(),
    'Unable to submit the catalog suggestion.'
  );
}
