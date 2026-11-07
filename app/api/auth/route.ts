import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin, handleError, json, parseBody } from '@/lib/supabase/http';

const credentials = { email: z.string().email().max(254), password: z.string().min(12).max(128) };
const input = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), ...credentials }).strict(),
  z
    .object({
      action: z.literal('signup'),
      ...credentials,
      displayName: z.string().trim().min(1).max(80).optional(),
      locale: z.enum(['en', 'pt-BR']).optional(),
    })
    .strict(),
  z.object({ action: z.literal('logout') }).strict(),
]);
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const supabase = await createClient();
    if (!supabase)
      return json({ error: 'Supabase is not configured. No real account has been created.' }, 503);
    if (body.action === 'logout') {
      const { error } = await supabase.auth.signOut();
      return error ? json({ error: 'Unable to sign out.' }, 502) : json({ ok: true });
    }
    if (body.action === 'signup') {
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
      const { data, error } = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: { display_name: body.displayName || 'Horion member' },
          emailRedirectTo: `${origin}/auth/callback?next=/${body.locale || 'en'}`,
        },
      });
      if (error)
        return json(
          {
            error: 'Account registration could not be completed. Check the details and try again.',
          },
          400
        );
      return json({ ok: true, userId: data.user?.id, emailConfirmationRequired: !data.session });
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    return error
      ? json({ error: 'Invalid email or password.' }, 401)
      : json({ ok: true, userId: data.user.id });
  } catch (error) {
    return handleError(error);
  }
}
export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) return json({ configured: false, user: null });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return json({ configured: true, user: user ? { id: user.id, email: user.email } : null });
  } catch (error) {
    return handleError(error);
  }
}
