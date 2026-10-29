import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";

// Live number of bets of the day. Cached 15 s by the CDN, so Supabase sees a
// few requests per minute whatever the traffic.
export async function GET() {
  await connection(); // computed per request (then cached by the CDN), never at build time
  const { data, error } = await createPublicClient().rpc("today_count");
  if (error) {
    console.error("api/count:", error.message);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { count: data as number },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=30" } },
  );
}
