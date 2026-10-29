import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";

async function cookieMethods() {
  const store = await cookies();
  return {
    getAll: () => store.getAll(),
    setAll(list: { name: string; value: string; options: Parameters<typeof store.set>[2] }[]) {
      try {
        list.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // Called from a Server Component, where cookies are read-only.
        // proxy.ts refreshes the session on the next request.
      }
    },
  };
}

/** Client acting as the signed-in player (RLS applies). */
export async function createClient() {
  return createServerClient(env.supabaseUrl(), env.supabasePublishableKey(), {
    cookies: await cookieMethods(),
  });
}

/**
 * Client for sign-in calls only (anonymous sign-in, magic link). It uses the
 * secret key so that Supabase Auth accepts the player's real IP in
 * `sb-forwarded-for` for its per-IP rate limits; otherwise every player would
 * share the server's IP. Never use it to query data.
 */
export async function createSignInClient() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return createServerClient(env.supabaseUrl(), env.supabaseSecretKey(), {
    cookies: await cookieMethods(),
    global: { headers: ip ? { "sb-forwarded-for": ip } : {} },
  });
}
