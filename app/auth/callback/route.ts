import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Return from Google (linking or signing in). Exchanges the PKCE code for a session.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const home = new URL("/", url.origin);
  const errorCode = url.searchParams.get("error_code");
  const errorDescription = url.searchParams.get("error_description");

  if (errorCode || errorDescription) {
    const known = errorCode === "identity_already_exists" ? "identity_taken" : null;
    if (!known) console.error("auth/callback: provider error", { errorCode, errorDescription });
    home.searchParams.set("auth", known ?? "unexpected");
    return NextResponse.redirect(home);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    console.error("auth/callback: missing code");
    home.searchParams.set("auth", "unexpected");
    return NextResponse.redirect(home);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("auth/callback: exchangeCodeForSession failed", { code: error.code, message: error.message });
    home.searchParams.set("auth", error.code === "identity_already_exists" ? "identity_taken" : "unexpected");
    return NextResponse.redirect(home);
  }
  const from = url.searchParams.get("from");
  if (from === "admin") return NextResponse.redirect(new URL("/admin", url.origin));
  home.searchParams.set("auth", from === "link" ? "saved" : "signed_in");
  return NextResponse.redirect(home);
}
