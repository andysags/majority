"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isAdminEmail } from "@/lib/admin-auth";
import { createClient, createSignInClient } from "@/lib/supabase/server";

export type AdminSignInResult = { ok: true; url?: string } | { ok: false; message: string };

/** Google sign-in, back to /admin. */
export async function adminSignInWithGoogle(): Promise<AdminSignInResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env.siteUrl()}/auth/callback?from=admin` },
  });
  if (error) {
    console.error("adminSignInWithGoogle:", { code: error.code, message: error.message });
    return { ok: false, message: error.code === "provider_disabled" ? "La connexion Google n'est pas encore activée dans Supabase." : "Connexion impossible pour le moment." };
  }
  return { ok: true, url: data.url };
}

/**
 * Magic link for admins. The same answer is given whether or not the address
 * is an admin, so this form does not reveal who the admins are.
 */
export async function adminSignInWithEmail(email: string, captchaToken: string | null): Promise<AdminSignInResult> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) return { ok: false, message: "Adresse e-mail invalide." };
  if (env.turnstileSiteKey() && !captchaToken) return { ok: false, message: "La vérification anti-robot a échoué. Recharge la page." };
  if (!isAdminEmail(e)) return { ok: true };
  const supabase = await createSignInClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: e,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${env.siteUrl()}/auth/confirm`,
      ...(captchaToken ? { captchaToken } : {}),
    },
  });
  if (error) {
    console.error("adminSignInWithEmail:", { code: error.code, message: error.message });
    if (error.code === "over_email_send_rate_limit") return { ok: false, message: "Trop d'e-mails envoyés. Réessaie dans une heure." };
    if (error.code === "captcha_failed") return { ok: false, message: "La vérification anti-robot a échoué. Recharge la page." };
    return { ok: false, message: "Envoi impossible pour le moment." };
  }
  return { ok: true };
}

/** Sign out of the admin session on this device, back to the game. */
export async function adminSignOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error("adminSignOut:", { code: error.code, message: error.message });
    throw new Error(`Déconnexion impossible : ${error.message}`);
  }
  redirect("/");
}
