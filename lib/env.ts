import "server-only";
import { assertDayKey } from "@/lib/game/day";

// Server-side configuration. A missing required variable is a deployment
// error: fail loudly with its name instead of running half-configured.

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing environment variable ${name} (see .env.example).`);
  return v.trim();
}

function optional(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabasePublishableKey: () => required("SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  launchDate: () => assertDayKey(required("LAUNCH_DATE")),
  siteUrl: () => required("SITE_URL").replace(/\/+$/, ""),
  adminEmails: () =>
    required("ADMIN_EMAILS")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  // Optional integrations: when unset, the feature is off (and /admin says so).
  turnstileSiteKey: () => optional("TURNSTILE_SITE_KEY"),
  clarityId: () => optional("CLARITY_PROJECT_ID"),
};
