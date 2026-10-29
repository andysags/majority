import "server-only";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side gate for /admin: a confirmed, non-anonymous account whose
 * e-mail is listed in ADMIN_EMAILS. Anyone else gets a 404, so the page's
 * existence is not revealed. getUser() asks Supabase Auth, so a revoked
 * account is refused immediately.
 */
export async function requireAdmin(): Promise<{ email: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) notFound();
  const u = data.user;
  const email = u.email?.toLowerCase();
  if (u.is_anonymous || !email || !u.email_confirmed_at) notFound();
  if (!env.adminEmails().includes(email)) notFound();
  return { email };
}
