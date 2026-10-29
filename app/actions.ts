"use server";

import { AuthError } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { dayKeyAt } from "@/lib/game/day";
import { dayMarks, EMPTY_STATS, type Choice } from "@/lib/game/scoring";
import { getClaims, getMe, type Me } from "@/lib/me";
import { isErrorCode, type ErrorCode } from "@/lib/messages";
import { createClient, createSignInClient } from "@/lib/supabase/server";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };

const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

function fromAuthError(where: string, e: AuthError): { ok: false; error: ErrorCode } {
  switch (e.code) {
    case "captcha_failed":
      return fail("captcha_failed");
    case "over_request_rate_limit":
      return fail("signin_rate_limited");
    case "over_email_send_rate_limit":
      return fail("email_rate_limited");
    case "email_exists":
    case "user_already_exists":
      return fail("email_taken");
    case "identity_already_exists":
      return fail("identity_taken");
    case "email_address_invalid":
    case "validation_failed":
      return fail("email_invalid");
    case "otp_disabled":
    case "user_not_found":
      return fail("email_unknown");
    case "provider_disabled":
    case "anonymous_provider_disabled":
    case "manual_linking_disabled":
      console.error(`${where}: auth provider not enabled in Supabase (${e.code}): ${e.message}`);
      return fail("provider_disabled");
    default:
      console.error(`${where}: unexpected auth error`, { code: e.code, status: e.status, message: e.message });
      return fail("unexpected");
  }
}

function fromRpc(where: string, res: { error: { message: string } | null; data: unknown }): Result<Record<string, unknown>> {
  if (res.error) {
    console.error(`${where}: ${res.error.message}`);
    return fail("unexpected");
  }
  const body = res.data as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (body?.ok === true) return { ok: true, data: body };
  if (isErrorCode(body?.error)) return fail(body.error);
  console.error(`${where}: unexpected response`, body);
  return fail("unexpected");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** First visit: create an anonymous account (Turnstile token required when configured). */
export async function signInAnonymously(captchaToken: string | null): Promise<Result<Me>> {
  const existing = await getMe(dayKeyAt(Date.now()));
  if (existing) return { ok: true, data: existing };
  if (env.turnstileSiteKey() && !captchaToken) return fail("captcha_failed");

  const supabase = await createSignInClient();
  const { data, error } = await supabase.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );
  if (error) return fromAuthError("signInAnonymously", error);
  if (!data.user) {
    console.error("signInAnonymously: no user returned");
    return fail("unexpected");
  }
  // A brand-new account has no history yet.
  return {
    ok: true,
    data: {
      userId: data.user.id,
      isAnonymous: true,
      email: null,
      pseudo: null,
      todayChoice: null,
      yesterdayChoice: null,
      stats: EMPTY_STATS,
      marks: dayMarks(dayKeyAt(Date.now()), {}, {}),
      rankAll: null,
      rankWeek: null,
      weekScore: 0,
    },
  };
}

/** Bet on today's question. `pseudo` is set first when the player has none yet. */
export async function castVote(choice: Choice, pseudo: string | null): Promise<Result<{ me: Me; day: string }>> {
  if (choice !== "A" && choice !== "B") return fail("invalid_choice");
  const { supabase, claims } = await getClaims();
  if (!claims) return fail("not_authenticated");

  if (pseudo !== null) {
    const p = fromRpc("set_pseudo", await supabase.rpc("set_pseudo", { p_pseudo: pseudo }));
    if (!p.ok) return p;
  }
  const v = fromRpc("cast_vote", await supabase.rpc("cast_vote", { p_choice: choice }));
  if (!v.ok) return v;
  const day = String(v.data.day);
  const me = await getMe(day);
  if (!me) return fail("not_authenticated");
  return { ok: true, data: { me, day } };
}

export async function savePseudo(pseudo: string): Promise<Result<{ pseudo: string }>> {
  const { supabase, claims } = await getClaims();
  if (!claims) return fail("not_authenticated");
  const p = fromRpc("set_pseudo", await supabase.rpc("set_pseudo", { p_pseudo: pseudo }));
  if (!p.ok) return p;
  return { ok: true, data: { pseudo: String(p.data.pseudo) } };
}

/** "Sauvegarder ma progression" with Google: links Google to the current (anonymous) account. */
export async function linkGoogle(): Promise<Result<{ url: string }>> {
  const { supabase, claims } = await getClaims();
  if (!claims) return fail("not_authenticated");
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${env.siteUrl()}/auth/callback?from=link` },
  });
  if (error) return fromAuthError("linkIdentity", error);
  return { ok: true, data: { url: data.url } };
}

/** "Sauvegarder ma progression" by e-mail: attaches the address, confirmed by a link. */
export async function linkEmail(email: string): Promise<Result<null>> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) return fail("email_invalid");
  const { supabase, claims } = await getClaims();
  if (!claims) return fail("not_authenticated");
  const { error } = await supabase.auth.updateUser(
    { email: e },
    { emailRedirectTo: `${env.siteUrl()}/auth/confirm` },
  );
  if (error) return fromAuthError("updateUser(email)", error);
  return { ok: true, data: null };
}

/** "J'ai déjà un compte": sign in on this device with Google. */
export async function signInWithGoogle(): Promise<Result<{ url: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env.siteUrl()}/auth/callback?from=signin` },
  });
  if (error) return fromAuthError("signInWithOAuth", error);
  return { ok: true, data: { url: data.url } };
}

/** "J'ai déjà un compte": magic link, only for accounts that already exist. */
export async function signInWithEmail(email: string, captchaToken: string | null): Promise<Result<null>> {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) return fail("email_invalid");
  if (env.turnstileSiteKey() && !captchaToken) return fail("captcha_failed");
  const supabase = await createSignInClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${env.siteUrl()}/auth/confirm`,
      ...(captchaToken ? { captchaToken } : {}),
    },
  });
  if (error) return fromAuthError("signInWithOtp", error);
  return { ok: true, data: null };
}
