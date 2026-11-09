import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig, sharedSignupEnabled } from '@/lib/supabase/config';
import { assertSameOrigin, handleError, json, parseBody } from '@/lib/supabase/http';
import { loginLiveAccount, RegistrationError, signupLiveAccount } from '@/lib/live/auth';

const email = z.string().email().max(254);
const sharingNotice =
  'Horion shares Supabase authentication with Rango. Signing in does not enroll you in Horion. Create your Horion member or store profile explicitly to participate.';
function accessFailure(cause: unknown, signingUp: boolean) {
  const code = cause instanceof RegistrationError ? cause.code : 'registration_failed';
  const failures: Record<string, { status: number; message: string }> = {
    rate_limited: { status: 429, message: 'Too many attempts. Wait before trying again.' },
    invalid_credentials: {
      status: 401,
      message: signingUp
        ? 'Unable to complete signup. If you already use Rango or Horion, sign in with that account password.'
        : 'Email or password is incorrect. Use the password of your existing Rango or Horion account.',
    },
    invalid_input: { status: 400, message: 'Review your account details.' },
    network_failed: { status: 503, message: 'The connection failed. Please try again.' },
    service_unavailable: { status: 503, message: 'Account access is temporarily unavailable.' },
    session_failed: { status: 502, message: 'Unable to open this session. Please sign in again.' },
    registration_failed: { status: 502, message: 'Account access could not be completed.' },
  };
  const failure = failures[code] || failures.registration_failed;
  return json({ error: failure.message, code }, failure.status);
}
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
      try {
        const result = await signupLiveAccount(
          supabase,
          {
            email: body.email,
            password: body.password,
            displayName: body.displayName || 'Horion member',
            locale: body.locale || 'en',
          },
          { enabled: true, origin, forwardOrigin: true }
        );
        return json({
          ok: true,
          userId: result.userId,
          emailConfirmationRequired: false,
          horionMembershipCreated: false,
          notice: sharingNotice,
        });
      } catch (error) {
        return accessFailure(error, true);
      }
    }
    try {
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).origin;
      const result = await loginLiveAccount(supabase, body.email, body.password, {
        origin,
        forwardOrigin: true,
      });
      return json({ ok: true, userId: result.userId, horionMembershipCreated: false });
    } catch (error) {
      return accessFailure(error, false);
    }
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
