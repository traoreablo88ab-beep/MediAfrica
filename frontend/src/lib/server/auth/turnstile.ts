import 'server-only';

// Cloudflare Turnstile verification for /api/auth/signup. Inert (always
// passes) when TURNSTILE_SECRET_KEY is unset — same "optional provider"
// pattern as Cloudinary/Resend/Bictorys: the route works out of the box,
// CAPTCHA activates the moment the env var is set.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;

  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
  return data?.success === true;
}
