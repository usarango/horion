import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, handleError, json, requireUser } from '@/lib/supabase/http';
import { detectFileType } from '@/lib/supabase/upload-validation';

/** Private, owner-authorized downloads; signed links expire in 60 seconds. */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireUser();
    const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get('id'));
    if (!id.success) return json({ error: 'Invalid document identifier.' }, 400);
    const { data: doc, error } = await supabase
      .from('passport_documents')
      .select('storage_path,file_name')
      .eq('id', id.data)
      .eq('owner_id', user.id)
      .single();
    if (error || !doc) return json({ error: 'Document not found.' }, 404);
    const { data, error: signError } = await supabase.storage
      .from('horion-passport-documents')
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
    return signError
      ? json({ error: 'Unable to authorize the download.' }, 502)
      : json({ url: data.signedUrl, expiresIn: 60 });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { supabase, user } = await requireUser();
    // Enforce a bounded body before buffering multipart form data. Reverse proxy
    // must also enforce this bound when accepting streaming/chunked requests.
    const declaredSize = Number(request.headers.get('content-length'));
    if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > 11 * 1024 * 1024)
      return json({ error: 'A valid upload size up to 10 MB is required.' }, 413);
    const form = await request.formData();
    const passportId = z.string().uuid().safeParse(form.get('passportId'));
    const file = form.get('file');
    if (
      !passportId.success ||
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > 10 * 1024 * 1024
    )
      return json({ error: 'Select a valid document up to 10 MB.' }, 400);
    const { data: passport } = await supabase
      .from('passports')
      .select('id')
      .eq('id', passportId.data)
      .eq('owner_id', user.id)
      .single();
    if (!passport) return json({ error: 'Passport not found.' }, 404);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectFileType(bytes);
    if (!mime) return json({ error: 'Only PDF, JPEG, PNG and WebP documents are supported.' }, 400);
    const path = `${user.id}/${passport.id}/${crypto.randomUUID()}`;
    const { error: uploadError } = await supabase.storage
      .from('horion-passport-documents')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) return json({ error: 'The private upload could not be completed.' }, 502);
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 240) || 'document';
    const { data, error } = await supabase
      .from('passport_documents')
      .insert({
        passport_id: passport.id,
        owner_id: user.id,
        storage_path: path,
        file_name: name,
        mime_type: mime,
        size_bytes: file.size,
      })
      .select('id,file_name,mime_type,size_bytes,created_at')
      .single();
    if (error) {
      await supabase.storage.from('horion-passport-documents').remove([path]);
      return json({ error: 'Unable to record the document. Please retry.' }, 502);
    }
    return json({ ok: true, data }, 201);
  } catch (error) {
    return handleError(error);
  }
}
