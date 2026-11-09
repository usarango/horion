import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from './server';

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expected = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  let valid = false;
  try {
    valid = !!origin && new URL(expected).origin === origin;
  } catch {
    /* Invalid configuration fails closed. */
  }
  if (!valid) throw json({ error: 'Invalid request origin.' }, 403);
}
export async function parseBody<T>(request: NextRequest, schema: z.ZodType<T>) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32768)
    throw json({ error: 'Request too large.' }, 413);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw json({ error: 'Invalid JSON.' }, 400);
  }
  const result = schema.safeParse(value);
  if (!result.success) throw json({ error: 'Invalid input.', fields: result.error.flatten() }, 400);
  return result.data;
}
export async function requireUser() {
  const supabase = await createClient();
  if (!supabase) throw json({ error: 'Horion is not connected. Please try again later.' }, 503);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw json({ error: 'Authentication required.' }, 401);
  return { supabase, user };
}
export function handleError(error: unknown) {
  if (error instanceof Response) return error;
  // Avoid logging request bodies, cookies, serials, credentials or documents.
  console.error(
    JSON.stringify({
      event: 'horion_api_failure',
      type: error instanceof Error ? error.name : 'unknown',
    })
  );
  return json({ error: 'The request could not be completed. Please try again.' }, 500);
}
