import { z } from 'zod';
import { parseConfirmationLink } from './confirmation';
import type { LiveClient, SignupInput } from './types';

// Auth and Functions do not depend on the client's selected PostgREST schema.
type AuthClient = Pick<LiveClient, 'auth' | 'functions'>;

export class RegistrationError extends Error {
  constructor(public readonly code: 'rate_limited' | 'registration_failed' | 'session_failed') {
    super(
      code === 'rate_limited'
        ? 'Please wait before trying to create an account again.'
        : 'Registration could not be completed. Check your details and try again.'
    );
    this.name = 'RegistrationError';
  }
}

type EntryOptions = { origin?: string; forwardOrigin?: boolean };

export async function loginLiveAccount(
  client: AuthClient,
  email: string,
  password: string,
  options: EntryOptions = {}
) {
  const credentials = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .parse({ email, password });
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error?.code === 'email_not_confirmed') {
    // The backend rechecks the password itself before changing confirmation.
    // A client-side error never authorizes an account update.
    return invokePasswordEntry(client, { intent: 'login', ...credentials }, options);
  }
  if (error || !data.session?.user?.id)
    throw new Error('Unable to sign in. Check your email and password.');
  return { userId: data.session.user.id };
}

export async function signupLiveAccount(
  client: AuthClient,
  input: SignupInput,
  options: EntryOptions & { enabled: boolean }
) {
  // No Auth operation occurs until the explicit deployment capability is enabled.
  if (!options.enabled) throw new Error('Account registration is not available yet.');
  const data = z
    .object({
      email: z.email().max(254),
      password: z.string().min(12).max(128),
      displayName: z.string().trim().min(1).max(80),
      locale: z.enum(['en', 'pt-BR']),
    })
    .parse(input);
  const result = await invokePasswordEntry(client, data, options);
  return { ...result, emailConfirmationRequired: false as const };
}

async function invokePasswordEntry(
  client: AuthClient,
  input: Record<string, unknown>,
  options: EntryOptions
) {
  const { data: result, error } = await client.functions.invoke('horion-register', {
    body: input,
    // Browsers supply Origin themselves. Server routes may forward their already
    // validated same-origin request; this never changes the shared Auth settings.
    ...(options.forwardOrigin && options.origin
      ? { headers: { Origin: new URL(options.origin).origin } }
      : {}),
  });
  if (error) {
    const context = 'context' in error ? error.context : null;
    throw new RegistrationError(
      context instanceof Response && context.status === 429 ? 'rate_limited' : 'registration_failed'
    );
  }
  const tokens = z
    // Refresh tokens are opaque; GoTrue also issues valid 12-character tokens.
    // Their validity is checked by setSession/getUser, not an invented length.
    .object({ access_token: z.string().min(20), refresh_token: z.string().min(1) })
    .strict()
    .safeParse(result);
  if (!tokens.success) throw new RegistrationError('session_failed');
  const { data: established, error: sessionError } = await client.auth.setSession(tokens.data);
  if (sessionError || !established.session?.user?.id) throw new RegistrationError('session_failed');
  const { data: verified, error: userError } = await client.auth.getUser();
  if (userError || !verified.user?.id || verified.user.id !== established.session.user.id) {
    // Do not retain a newly established but unverified Horion session. Local
    // revocation preserves the member's other application sessions.
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new RegistrationError('session_failed');
  }
  return { userId: verified.user.id };
}

export async function confirmLiveEmail(
  client: AuthClient,
  confirmationUrl: string,
  supabaseUrl: string
) {
  const confirmation = parseConfirmationLink(confirmationUrl, supabaseUrl);
  const { data, error } = await client.auth.verifyOtp(confirmation);
  if (error || !data.session)
    throw new Error(
      'This confirmation link could not be verified. It may have expired or already been used.'
    );
}

export async function signoutLiveAccount(client: AuthClient) {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw new Error('Unable to sign out. Please try again.');
}
