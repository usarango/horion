import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin, handleError, json, requireUser } from '@/lib/supabase/http';
import { detectFileType } from '@/lib/supabase/upload-validation';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    if (!supabase) return json({ error: 'Supabase is not configured.' }, 503);
    const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('id'));
    if (!id.success) return json({ error: 'Invalid media identifier.' }, 400);
    const { data: media } = await supabase
      .from('media')
      .select('storage_path,alt_text')
      .eq('id', id.data)
      .single();
    if (!media) return json({ error: 'Media not found.' }, 404);
    const { data, error } = await supabase.storage
      .from('horion-post-media')
      .createSignedUrl(media.storage_path, 300);
    return error
      ? json({ error: 'Unable to load this image.' }, 502)
      : json({ url: data.signedUrl, alt: media.alt_text, expiresIn: 300 });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    const declared = Number(request.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0 || declared > 9 * 1024 * 1024)
      return json({ error: 'An upload size up to 8 MB is required.' }, 413);
    const form = await request.formData();
    const postId = z.string().uuid().safeParse(form.get('postId'));
    const file = form.get('file');
    const alt = String(form.get('alt') || '')
      .trim()
      .slice(0, 500);
    if (
      !postId.success ||
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 8 * 1024 * 1024
    )
      return json({ error: 'Select a JPEG, PNG or WebP image up to 8 MB.' }, 400);
    const { data: post } = await supabase
      .from('posts')
      .select('id')
      .eq('id', postId.data)
      .eq('author_id', user.id)
      .eq('status', 'published')
      .single();
    if (!post) return json({ error: 'Post not found.' }, 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectFileType(bytes);
    if (!mime || mime === 'application/pdf')
      return json({ error: 'Only JPEG, PNG and WebP images are supported.' }, 400);
    const path = `${user.id}/${post.id}/${crypto.randomUUID()}`;
    const { error: uploadError } = await supabase.storage
      .from('horion-post-media')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) return json({ error: 'Image upload failed. Please try again.' }, 502);
    const { data, error } = await supabase
      .from('media')
      .insert({
        owner_id: user.id,
        post_id: post.id,
        storage_path: path,
        alt_text: alt,
        mime_type: mime,
        size_bytes: file.size,
      })
      .select('id,alt_text,mime_type,size_bytes')
      .single();
    if (error) {
      await supabase.storage.from('horion-post-media').remove([path]);
      return json({ error: 'Unable to attach the image. Please retry.' }, 502);
    }
    return json({ ok: true, data }, 201);
  } catch (error) {
    return handleError(error);
  }
}
