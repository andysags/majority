import "server-only";
import { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/game/day";
import { dayMarks, EMPTY_STATS, type Choice, type Majority, type Mark, type PlayerStats } from "@/lib/game/scoring";

export type Me = {
  isAnonymous: boolean;
  email: string | null;
  pseudo: string | null;
  todayChoice: Choice | null;
  yesterdayChoice: Choice | null;
  stats: PlayerStats;
  marks: Mark[];
  rankAll: number | null;
  rankWeek: number | null;
  weekScore: number;
  userId: string;
};

type MyStateRow = {
  today: string;
  pseudo: string | null;
  stats: PlayerStats | null;
  votes: Record<string, Choice>;
  results: Record<string, Majority>;
  rankAll: number | null;
  rankWeek: number | null;
  weekScore: number | null;
};

/** Verified identity of the current visitor, or null without a valid session. */
export async function getClaims() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    // An expired or revoked session is a normal state: the visitor gets a new
    // anonymous account. Anything else (network, misconfiguration) is a bug.
    if (error instanceof AuthError && error.status !== undefined && error.status < 500) {
      console.warn("getClaims: session rejected:", error.message);
      return { supabase, claims: null };
    }
    throw error;
  }
  return { supabase, claims: data?.claims ?? null };
}

/** Everything the page needs about the player, computed for game day `today`. */
export async function getMe(today: string): Promise<Me | null> {
  const { supabase, claims } = await getClaims();
  if (!claims) return null;
  const { data, error } = await supabase.rpc("my_state");
  if (error) throw new Error(`my_state: ${error.message}`);
  const s = data as MyStateRow;
  return {
    userId: claims.sub,
    isAnonymous: claims.is_anonymous === true,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    pseudo: s.pseudo,
    todayChoice: s.votes[today] ?? null,
    yesterdayChoice: s.votes[addDays(today, -1)] ?? null,
    stats: s.stats ?? EMPTY_STATS,
    marks: dayMarks(today, s.votes, s.results),
    rankAll: s.rankAll,
    rankWeek: s.rankWeek,
    weekScore: s.weekScore ?? 0,
  };
}
