import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin, handleError, json, parseBody, requireUser } from '@/lib/supabase/http';

const uuid = z.string().uuid();
const action = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('profile'),
      username: z.string().regex(/^[a-z0-9_]{3,32}$/),
      display_name: z.string().trim().min(1).max(80),
      bio: z.string().max(1200),
      country: z.string().max(80).nullable(),
      locale: z.enum(['en', 'pt-BR', 'es']),
      collection_public: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('membership'), community_id: uuid, joined: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('post'),
      community_id: uuid,
      title: z.string().trim().min(3).max(240),
      body: z.string().trim().min(1).max(20000),
      kind: z.enum([
        'text',
        'photography',
        'discussion',
        'review',
        'question',
        'guide',
        'video',
        'poll',
      ]),
      language: z.enum(['en', 'pt-BR', 'es']),
      reference_id: uuid.nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('comment'),
      post_id: uuid,
      body: z.string().trim().min(1).max(5000),
      parent_id: uuid.nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('vote'),
      post_id: uuid,
      value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
    })
    .strict(),
  z.object({ action: z.literal('save'), post_id: uuid, saved: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('watch'),
      reference_id: uuid.nullable(),
      label: z.string().trim().min(1).max(160),
      status: z.enum(['owned', 'previously-owned', 'wishlist']),
      visibility: z.enum(['private', 'public']).default('private'),
    })
    .strict(),
  z.object({ action: z.literal('passport'), watch_id: uuid }).strict(),
  z
    .object({
      action: z.literal('event'),
      passport_id: uuid,
      event_type: z.enum([
        'acquisition',
        'service',
        'maintenance',
        'restoration',
        'strap',
        'component',
        'inspection',
        'valuation',
        'sale',
      ]),
      occurred_on: z.iso.date(),
      description: z.string().trim().min(1).max(5000),
    })
    .strict(),
  z
    .object({
      action: z.literal('report'),
      post_id: uuid,
      reason: z.string().trim().min(5).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal('moderate'),
      post_id: uuid,
      status: z.enum(['published', 'removed']),
      pinned: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal('notifications-read') }).strict(),
]);

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) return json({ error: 'Horion is not connected. Please try again later.' }, 503);
    const resource = request.nextUrl.searchParams.get('resource') || 'posts';
    const page = Math.min(
      10000,
      Math.max(0, Number(request.nextUrl.searchParams.get('page')) || 0)
    );
    const from = Math.floor(page) * 24;
    if (['posts', 'communities', 'references'].includes(resource)) {
      let query;
      if (resource === 'communities')
        query = supabase
          .from('communities')
          .select('id,slug,name,description,rules,image_path')
          .eq('is_public', true)
          .order('name');
      else if (resource === 'references')
        query = supabase
          .from('watch_references')
          .select(
            '*,watch_models(name,watch_collections(name,brands(name))),catalog_sources(url,title)'
          )
          .eq('review_status', 'approved')
          .order('reference');
      else {
        query = supabase
          .from('posts')
          .select(
            '*,profiles!posts_author_id_fkey(username,display_name,avatar_path),communities(slug,name),media(storage_path,alt_text)'
          )
          .eq('status', 'published')
          .order('created_at', { ascending: false });
        const search = request.nextUrl.searchParams.get('q')?.trim().slice(0, 120);
        if (search) query = query.ilike('title', `%${search.replace(/[%_\\]/g, '')}%`);
        const language = request.nextUrl.searchParams.get('language');
        if (language && ['en', 'pt-BR', 'es'].includes(language))
          query = query.eq('language', language);
      }
      const { data, error } = await query.range(from, from + 23);
      if (error)
        return json(
          { error: 'Content is unavailable. Check the Horion migration and connection.' },
          502
        );
      return json({ data, page, hasMore: data.length === 24 });
    }
    const { user } = await requireUser();
    let query;
    switch (resource) {
      case 'watches':
        query = supabase
          .from('user_watches')
          .select('*,watch_private(*),watch_references(reference)')
          .eq('owner_id', user.id);
        break;
      case 'passports':
        query = supabase
          .from('passports')
          .select(
            '*,passport_events(*),passport_documents(id,file_name,mime_type,size_bytes,created_at)'
          )
          .eq('owner_id', user.id);
        break;
      case 'profile':
        query = supabase.from('profiles').select('*').eq('id', user.id);
        break;
      case 'notifications':
        query = supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false });
        break;
      case 'reports':
        query = supabase.from('reports').select('*').order('created_at', { ascending: false });
        break;
      default:
        return json({ error: 'Unknown resource.' }, 400);
    }
    const { data, error } = await query.range(from, from + 23);
    return error
      ? json({ error: 'Unable to load records.' }, 502)
      : json({ data, page, hasMore: data.length === 24 });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, action);
    const { supabase, user } = await requireUser();
    let query;
    switch (body.action) {
      case 'profile': {
        const { action: _, ...profile } = body;
        query = supabase.from('profiles').update(profile).eq('id', user.id).select();
        break;
      }
      case 'membership':
        query = body.joined
          ? supabase
              .from('memberships')
              .upsert(
                { community_id: body.community_id, user_id: user.id },
                { onConflict: 'community_id,user_id', ignoreDuplicates: true }
              )
              .select()
          : supabase
              .from('memberships')
              .delete()
              .eq('community_id', body.community_id)
              .eq('user_id', user.id)
              .select();
        break;
      case 'post': {
        const { action: _, ...post } = body;
        query = supabase
          .from('posts')
          .insert({ ...post, author_id: user.id })
          .select();
        break;
      }
      case 'comment':
        query = supabase
          .from('comments')
          .insert({
            post_id: body.post_id,
            body: body.body,
            parent_id: body.parent_id,
            author_id: user.id,
          })
          .select();
        break;
      case 'vote':
        query = supabase.rpc('cast_vote', { p_post_id: body.post_id, p_value: body.value });
        break;
      case 'save':
        query = body.saved
          ? supabase
              .from('saved_posts')
              .upsert(
                { post_id: body.post_id, user_id: user.id },
                { onConflict: 'post_id,user_id', ignoreDuplicates: true }
              )
              .select()
          : supabase
              .from('saved_posts')
              .delete()
              .eq('post_id', body.post_id)
              .eq('user_id', user.id)
              .select();
        break;
      case 'watch':
        query = supabase
          .from('user_watches')
          .insert({
            owner_id: user.id,
            reference_id: body.reference_id,
            label: body.label,
            status: body.status,
            visibility: body.visibility,
          })
          .select();
        break;
      case 'passport':
        query = supabase
          .from('passports')
          .insert({ watch_id: body.watch_id, owner_id: user.id })
          .select();
        break;
      case 'event':
        query = supabase
          .from('passport_events')
          .insert({
            owner_id: user.id,
            passport_id: body.passport_id,
            event_type: body.event_type,
            occurred_on: body.occurred_on,
            description: body.description,
            verification: 'owner-declared',
          })
          .select();
        break;
      case 'report':
        query = supabase
          .from('reports')
          .insert({ reporter_id: user.id, post_id: body.post_id, reason: body.reason })
          .select();
        break;
      case 'moderate':
        query = supabase
          .from('posts')
          .update({
            status: body.status,
            ...(body.pinned === undefined ? {} : { pinned: body.pinned }),
          })
          .eq('id', body.post_id)
          .select();
        break;
      case 'notifications-read':
        query = supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('recipient_id', user.id)
          .is('read_at', null)
          .select();
        break;
    }
    const { data, error } = await query;
    if (error)
      return json(
        {
          error:
            error.code === '23505'
              ? 'This record already exists.'
              : error.code === 'P0001'
                ? 'Please wait before publishing again.'
                : 'The operation was denied or could not be completed.',
        },
        error.code === 'P0001' ? 429 : 400
      );
    if (
      !data?.length &&
      !['membership', 'save', 'notifications-read'].includes(body.action) &&
      !(body.action === 'vote' && body.value === 0)
    )
      return json({ error: 'No accessible record matched this operation.' }, 403);
    return json({ ok: true, data });
  } catch (error) {
    return handleError(error);
  }
}
