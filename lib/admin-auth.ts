import "server-only";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AdminGate = { state: "admin"; email: string } | { state: "sign_in" };

/**
 * Server-side gate for /admin. A confirmed, non-anonymous account whose
 * e-mail is in ADMIN_EMAILS gets in. A visitor without a permanent account
 * gets the sign-in form. Any other signed-in account gets a 404. getUser()
 * asks Supabase Auth, so a revoked account is refused immediately.
 */
export async function adminGate(): Promise<AdminGate> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const u = error ? null : data.user;
  if (!u || u.is_anonymous) return { state: "sign_in" };
  const email = u.email?.toLowerCase();
  if (!email || !u.email_confirmed_at || !isAdminEmail(email)) notFound();
  return { state: "admin", email };
}

/** For server actions: anything but an admin is a 404. */
export async function requireAdmin(): Promise<{ email: string }> {
  const gate = await adminGate();
  if (gate.state !== "admin") notFound();
  return { email: gate.email };
}

export function isAdminEmail(email: string): boolean {
  return env.adminEmails().includes(email.trim().toLowerCase());
}
