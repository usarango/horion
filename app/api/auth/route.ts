import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig, sharedSignupEnabled } from '@/lib/supabase/config';
import { assertSameOrigin, handleError, json, parseBody } from '@/lib/supabase/http';

const email = z.string().email().max(254);
const sharingNotice =
  'Horion shares Supabase authentication with Rango. Signing in does not enroll you in Horion. Create your Horion member or store profile explicitly to participate.';
const input = z.discriminatedUnion('action', [
  // Existing shared-project credentials retain their existing password requirements.
  z.object({ action: z.literal('login'), email, password: z.string().min(1).max(128) }).strict(),
  z
    .object({
      action: z.literal('signup'),
      email,
      password: z.string().min(12).max(128),
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
    if (!getSupabaseConfig())
      return json({ error: 'Supabase is not configured. No real account has been created.' }, 503);
    // Check before constructing the Auth client: disabled signup makes no Auth request.
    if (body.action === 'signup' && !sharedSignupEnabled())
      return json(
        {
          error:
            'New shared-project accounts are disabled. Sign in with an existing account, then explicitly join Horion.',
          signupEnabled: false,
        },
        403
      );
    const supabase = await createClient();
    if (!supabase) return json({ error: 'Supabase is not configured.' }, 503);
    if (body.action === 'logout') {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
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
      return json({
        ok: true,
        userId: data.user?.id,
        emailConfirmationRequired: !data.session,
        horionMembershipCreated: false,
        notice: sharingNotice,
      });
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    return error
      ? json({ error: 'Invalid email or password.' }, 401)
      : json({ ok: true, userId: data.user.id, horionMembershipCreated: false });
  } catch (error) {
    return handleError(error);
  }
}
export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase)
      return json({
        configured: false,
        user: null,
        member: null,
        signupEnabled: false,
        sharedAuth: true,
        onboardingAvailable: false,
        notice: sharingNotice,
      });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    const capabilities = {
      configured: true,
      signupEnabled: sharedSignupEnabled(),
      sharedAuth: true,
      notice: sharingNotice,
    };
    if (authError || !user)
      return json({
        ...capabilities,
        user: null,
        member: null,
        onboardingAvailable: false,
        ...(authError && authError.name !== 'AuthSessionMissingError'
          ? { authUnavailable: true }
          : {}),
      });
    const { data: member, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,locale,account_type,website,contact_email')
      .eq('id', user.id)
      .maybeSingle();
    return json({
      ...capabilities,
      user: { id: user.id, email: user.email },
      member: member
        ? {
            id: member.id,
            username: member.username,
            displayName: member.display_name,
            locale: member.locale,
            accountType: member.account_type,
            website: member.website || '',
            contact: member.contact_email || '',
          }
        : null,
      onboardingAvailable: !error,
      ...(error ? { memberUnavailable: true } : {}),
    });
  } catch (error) {
    return handleError(error);
  }
}
