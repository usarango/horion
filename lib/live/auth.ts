import { z } from 'zod';
import { parseConfirmationLink } from './confirmation';
import type { LiveClient, SignupInput } from './types';

export async function loginLiveAccount(client: LiveClient, email: string, password: string) {
  const credentials = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .parse({ email, password });
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.session) throw new Error('Unable to sign in. Check your email and password.');
}

export async function signupLiveAccount(
  client: LiveClient,
  input: SignupInput,
  options: { enabled: boolean; origin: string }
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
  const origin = new URL(options.origin).origin;
  const { data: result, error } = await client.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: { display_name: data.displayName },
      emailRedirectTo: `${origin}/${data.locale}`,
    },
  });
  if (error)
    throw new Error('Registration could not be completed. Check your details and try again.');
  return { emailConfirmationRequired: !result.session };
}

export async function confirmLiveEmail(
  client: LiveClient,
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

export async function signoutLiveAccount(client: LiveClient) {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw new Error('Unable to sign out. Please try again.');
}
