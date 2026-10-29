import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Majority } from "@/lib/game/scoring";

// Public data, cached per day on the server so a traffic spike does not reach
// Supabase. Every key includes the day, so midnight starts fresh entries by
// itself; a verdict not yet computed (00:00-00:05) is cached for one minute only.

export type Question = {
  day: string;
  optionA: string;
  optionB: string;
  sponsorName: string | null;
  sponsorUrl: string | null;
  sponsorLogoUrl: string | null;
};

export type Verdict = {
  day: string;
  countA: number;
  countB: number;
  total: number;
  majority: Majority;
};

export type BoardRow = { rank: number; userId: string; pseudo: string; score: number; streak: number };

export const questionTag = (day: string) => `question:${day}`;

export async function getQuestion(day: string): Promise<Question | null> {
  "use cache";
  cacheTag("questions", questionTag(day));
  const { data, error } = await createPublicClient()
    .from("questions")
    .select("day, option_a, option_b, sponsor_name, sponsor_url, sponsor_logo_url")
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(`getQuestion(${day}): ${error.message}`);
  // A missing question may still be added by the admin: check again soon.
  if (data) cacheLife("hours");
  else cacheLife("minutes");
  if (!data) return null;
  return {
    day: data.day,
    optionA: data.option_a,
    optionB: data.option_b,
    sponsorName: data.sponsor_name,
    sponsorUrl: data.sponsor_url,
    sponsorLogoUrl: data.sponsor_logo_url,
  };
}

export async function getVerdict(day: string): Promise<Verdict | null> {
  "use cache";
  cacheTag("verdicts");
  const { data, error } = await createPublicClient()
    .from("daily_results")
    .select("day, count_a, count_b, total, majority")
    .eq("day", day)
    .maybeSingle();
  if (error) throw new Error(`getVerdict(${day}): ${error.message}`);
  if (!data) {
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return null;
  }
  cacheLife("max"); // a verdict never changes
  return { day: data.day, countA: data.count_a, countB: data.count_b, total: data.total, majority: data.majority };
}

/**
 * Both boards for a given game day. `settled` tells whether yesterday's
 * verdict was already applied; until then the entry lives one minute.
 */
export async function getBoards(today: string, yesterday: string) {
  "use cache";
  cacheTag("boards");
  const db = createPublicClient();
  const [all, week, settled] = await Promise.all([
    db.rpc("leaderboard", { p_scope: "all", p_limit: 50 }),
    db.rpc("leaderboard", { p_scope: "week", p_limit: 50 }),
    isSettled(db, yesterday),
  ]);
  if (all.error) throw new Error(`leaderboard(all): ${all.error.message}`);
  if (week.error) throw new Error(`leaderboard(week): ${week.error.message}`);
  if (settled) cacheLife("hours");
  else cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  const map = (rows: { rank: number; user_id: string; pseudo: string; score: number; streak: number }[]): BoardRow[] =>
    rows.map((r) => ({ rank: r.rank, userId: r.user_id, pseudo: r.pseudo, score: r.score, streak: r.streak }));
  return { today, all: map(all.data ?? []), week: map(week.data ?? []) };
}

async function isSettled(db: ReturnType<typeof createPublicClient>, yesterday: string): Promise<boolean> {
  const [q, r] = await Promise.all([
    db.from("questions").select("day").eq("day", yesterday).maybeSingle(),
    db.from("daily_results").select("day").eq("day", yesterday).maybeSingle(),
  ]);
  if (q.error) throw new Error(`isSettled(question ${yesterday}): ${q.error.message}`);
  if (r.error) throw new Error(`isSettled(verdict ${yesterday}): ${r.error.message}`);
  return !q.data || !!r.data;
}
