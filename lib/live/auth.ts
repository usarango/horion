import { z } from 'zod';
import { parseConfirmationLink } from './confirmation';
import type { LiveClient, SignupInput } from './types';

// Auth and Functions do not depend on the client's selected PostgREST schema.
type AuthClient = Pick<LiveClient, 'auth' | 'functions'>;

export type RegistrationErrorCode =
  | 'invalid_credentials'
  | 'invalid_input'
  | 'network_failed'
  | 'service_unavailable'
  | 'rate_limited'
  | 'registration_failed'
  | 'session_failed';

const ERROR_MESSAGES: Record<RegistrationErrorCode, string> = {
  invalid_credentials: 'Unable to sign in. Check your email and password.',
  invalid_input: 'Review your account details and try again.',
  network_failed: 'Unable to connect to the sign-in service. Please try again.',
  service_unavailable: 'Account access is temporarily unavailable. Please try again.',
  rate_limited: 'Please wait before trying to create an account again.',
  registration_failed: 'Account access could not be completed. Please try again.',
  session_failed: 'Your session could not be established. Please sign in again.',
};

export class RegistrationError extends Error {
  constructor(public readonly code: RegistrationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'RegistrationError';
  }
}

type EntryOptions = { origin?: string; forwardOrigin?: boolean };

function errorProperty(error: unknown, name: 'name' | 'code' | 'status' | 'context'): unknown {
  return error && typeof error === 'object' && name in error
    ? (error as Record<string, unknown>)[name]
    : undefined;
}

/** Only trusted categories are read; provider messages may contain private details. */
function authErrorCode(error: unknown): RegistrationErrorCode {
  const name = errorProperty(error, 'name');
  const code = errorProperty(error, 'code');
  const status = errorProperty(error, 'status');
  if (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    code === 'rate_limited'
  )
    return 'rate_limited';
  if (
    name === 'FunctionsRelayError' ||
    (typeof status === 'number' && status >= 500) ||
    code === 'unexpected_failure' ||
    code === 'unavailable' ||
    code === 'service_unavailable'
  )
    return 'service_unavailable';
  if (name === 'AuthRetryableFetchError' || name === 'FunctionsFetchError' || name === 'TypeError')
    return 'network_failed';
  if (code === 'invalid_credentials') return 'invalid_credentials';
  if (code === 'invalid_request' || code === 'invalid_input') return 'invalid_input';
  return 'registration_failed';
}

async function functionErrorCode(error: unknown): Promise<RegistrationErrorCode> {
  const context = errorProperty(error, 'context');
  if (!(context instanceof Response)) return authErrorCode(error);
  if (context.status === 429) return 'rate_limited';
  if (context.status >= 500 || context.status === 403) return 'service_unavailable';
  let code: unknown;
  try {
    const body: unknown = await context.clone().json();
    code = errorProperty(body, 'code');
  } catch {
    // An unexpected gateway response is not evidence of incorrect credentials.
  }
  if (context.status === 401)
    return code === 'invalid_credentials' ? 'invalid_credentials' : 'service_unavailable';
  if (context.status === 400 && (code === 'invalid_request' || code === 'invalid_input'))
    return 'invalid_input';
  return 'registration_failed';
}

function sessionErrorCode(error: unknown): RegistrationErrorCode {
  const code = authErrorCode(error);
  return code === 'network_failed' || code === 'service_unavailable' || code === 'rate_limited'
    ? code
    : 'session_failed';
}

export async function loginLiveAccount(
  client: AuthClient,
  email: string,
  password: string,
  options: EntryOptions = {}
) {
  const credentials = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse({ email, password });
  if (!credentials.success) throw new RegistrationError('invalid_input');
  let attempt: Awaited<ReturnType<AuthClient['auth']['signInWithPassword']>>;
  try {
    attempt = await client.auth.signInWithPassword(credentials.data);
  } catch (error) {
    throw new RegistrationError(authErrorCode(error));
  }
  const { data, error } = attempt;
  if (error?.code === 'email_not_confirmed') {
    // The backend rechecks the password itself before changing confirmation.
    // A client-side error never authorizes an account update.
    return invokePasswordEntry(client, { intent: 'login', ...credentials.data }, options);
  }
  if (error) throw new RegistrationError(authErrorCode(error));
  if (!data.session?.user?.id) throw new RegistrationError('session_failed');
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
    .safeParse(input);
  if (!data.success) throw new RegistrationError('invalid_input');
  const result = await invokePasswordEntry(client, data.data, options);
  return { ...result, emailConfirmationRequired: false as const };
}

async function invokePasswordEntry(
  client: AuthClient,
  input: Record<string, unknown>,
  options: EntryOptions
) {
  let response: Awaited<ReturnType<AuthClient['functions']['invoke']>>;
  try {
    response = await client.functions.invoke('horion-register', {
      body: input,
      // Browsers supply Origin themselves. Server routes may forward their already
      // validated same-origin request; this never changes the shared Auth settings.
      ...(options.forwardOrigin && options.origin
        ? { headers: { Origin: new URL(options.origin).origin } }
        : {}),
    });
  } catch (error) {
    throw new RegistrationError(authErrorCode(error));
  }
  const { data: result, error } = response;
  if (error) {
    throw new RegistrationError(await functionErrorCode(error));
  }
  const tokens = z
    // Refresh tokens are opaque; GoTrue also issues valid 12-character tokens.
    // Their validity is checked by setSession/getUser, not an invented length.
    .object({ access_token: z.string().min(20), refresh_token: z.string().min(1) })
    .strict()
    .safeParse(result);
  if (!tokens.success) throw new RegistrationError('session_failed');
  let session: Awaited<ReturnType<AuthClient['auth']['setSession']>>;
  try {
    session = await client.auth.setSession(tokens.data);
  } catch (error) {
    throw new RegistrationError(sessionErrorCode(error));
  }
  const { data: established, error: sessionError } = session;
  if (sessionError || !established.session?.user?.id)
    throw new RegistrationError(sessionErrorCode(sessionError));
  let verification: Awaited<ReturnType<AuthClient['auth']['getUser']>>;
  try {
    verification = await client.auth.getUser();
  } catch (error) {
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new RegistrationError(sessionErrorCode(error));
  }
  const { data: verified, error: userError } = verification;
  if (userError || !verified.user?.id || verified.user.id !== established.session.user.id) {
    // Do not retain a newly established but unverified Horion session. Local
    // revocation preserves the member's other application sessions.
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    throw new RegistrationError(sessionErrorCode(userError));
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
