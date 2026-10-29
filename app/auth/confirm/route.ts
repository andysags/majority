import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

// Admins land on /admin after following a link; players go back to the game.
const isAdminUser = (u: User | null) => !!u && !u.is_anonymous && !!u.email && isAdminEmail(u.email);

// Links from e-mails (see supabase/templates): magic link sign-in and
// confirmation of the address attached to an anonymous account.
// The token_hash form works even if the link is opened in another browser.
const TYPES: Record<string, EmailOtpType> = { email: "email", magiclink: "magiclink", email_change: "email_change" };

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const home = new URL("/", url.origin);
  const tokenHash = url.searchParams.get("token_hash");
  const type = TYPES[url.searchParams.get("type") ?? ""];
  const code = url.searchParams.get("code");

  // Default Supabase templates (not customised yet) send a PKCE code instead.
  if (code && !tokenHash) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("auth/confirm: exchangeCodeForSession failed", { code: error.code, message: error.message });
      home.searchParams.set("auth", "link_invalid");
      return NextResponse.redirect(home);
    }
    if (isAdminUser(data.user)) return NextResponse.redirect(new URL("/admin", url.origin));
    home.searchParams.set("auth", "signed_in");
    return NextResponse.redirect(home);
  }

  if (!tokenHash || !type) {
    console.error("auth/confirm: missing or invalid parameters");
    home.searchParams.set("auth", "link_invalid");
    return NextResponse.redirect(home);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // Expired or already used links are common; anything else is logged.
    if (error.code !== "otp_expired") console.error("auth/confirm: verifyOtp failed", { code: error.code, message: error.message });
    home.searchParams.set("auth", "link_invalid");
    return NextResponse.redirect(home);
  }
  if (isAdminUser(data.user)) return NextResponse.redirect(new URL("/admin", url.origin));
  home.searchParams.set("auth", type === "email_change" ? "saved" : "signed_in");
  return NextResponse.redirect(home);
}
