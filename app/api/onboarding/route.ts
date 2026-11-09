import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, handleError, json, parseBody, requireUser } from '@/lib/supabase/http';

const input = z
  .object({
    username: z.string().regex(/^[a-z0-9_]{3,32}$/),
    displayName: z.string().trim().min(1).max(80),
    locale: z.enum(['en', 'pt-BR', 'es']),
    accountType: z.enum(['member', 'store']).default('member'),
    website: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      })
      .optional(),
    // Deliberately public profile contact, never copied from the Auth email.
    contact: z.string().trim().max(254).email().or(z.literal('')).optional(),
  })
  .strict();

/** Explicitly enroll an existing authenticated identity; never create Auth users. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const { supabase } = await requireUser();
    // The SECURITY INVOKER RPC uses auth.uid(), validates inputs, and creates
    // the public/private Horion profile atomically without touching Rango rows.
    const { data, error } = await supabase.rpc('onboard_member', {
      p_username: body.username,
      p_display_name: body.displayName,
      p_locale: body.locale,
      p_account_type: body.accountType,
      p_website: body.website || null,
      p_contact_email: body.contact || null,
    });
    if (error) {
      if (error.code === '23505')
        return json({ error: 'This Horion username is unavailable.' }, 409);
      if (['23514', '22023'].includes(error.code))
        return json({ error: 'Check your Horion membership details.' }, 400);
      if (['PGRST106', 'PGRST202', '3F000', '42883'].includes(error.code))
        return json(
          {
            error:
              'Horion membership is not configured yet. Your existing account was not changed.',
          },
          503
        );
      return json({ error: 'Unable to create your Horion membership. Please try again.' }, 502);
    }
    const member = Array.isArray(data) ? data[0] : data;
    if (!member) return json({ error: 'Your Horion membership could not be confirmed.' }, 502);
    return json(
      {
        ok: true,
        member: {
          id: member.id,
          username: member.username,
          displayName: member.display_name,
          locale: member.locale,
          accountType: member.account_type,
          website: member.website || '',
          contact: member.contact_email || '',
        },
      },
      201
    );
  } catch (error) {
    return handleError(error);
  }
}
