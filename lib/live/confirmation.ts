export type EmailConfirmationToken = {
  token_hash: string;
  type: 'email';
};

const verificationPath = '/auth/v1/verify';
const maxLinkLength = 4096;
const tokenHashPattern = /^[A-Za-z0-9_-]{32,512}$/;

function invalidLink(): never {
  // Do not include the input: confirmation links are single-use credentials.
  throw new Error('Use the complete confirmation link from your email.');
}

/**
 * Read a Supabase confirmation link without opening or consuming it. The caller
 * passes the returned object directly to auth.verifyOtp; POST verification
 * returns the session without depending on the shared project's redirect list.
 */
export function parseConfirmationLink(input: string, supabaseUrl: string): EmailConfirmationToken {
  const text = input.trim();
  if (
    !text ||
    text.length > maxLinkLength ||
    /[\u0000-\u0020\u007f\\]/.test(text) ||
    text.includes('#')
  ) {
    return invalidLink();
  }

  let expected: URL;
  let link: URL;
  try {
    expected = new URL(supabaseUrl);
    link = new URL(text);
  } catch {
    return invalidLink();
  }

  if (
    expected.protocol !== 'https:' ||
    expected.username ||
    expected.password ||
    link.protocol !== 'https:' ||
    link.origin !== expected.origin ||
    link.username ||
    link.password ||
    link.pathname !== verificationPath
  ) {
    return invalidLink();
  }

  const types = link.searchParams.getAll('type');
  const tokens = [...link.searchParams.getAll('token'), ...link.searchParams.getAll('token_hash')];
  if (
    types.length !== 1 ||
    (types[0] !== 'email' && types[0] !== 'signup') ||
    tokens.length !== 1 ||
    !tokenHashPattern.test(tokens[0])
  ) {
    return invalidLink();
  }

  // ConfirmationURL names the TokenHash parameter "token". verifyOtp expects
  // "token_hash" and resolves "email" to signup or magic-link verification.
  return { token_hash: tokens[0], type: 'email' };
}
