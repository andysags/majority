// Scoring rules. The nightly SQL job (public.finalize_day) is the source of
// truth for stored stats; these pure functions mirror it so the rules are
// unit-tested, and so the UI can derive the 7-day strip and share text.

import { addDays } from "./day";

export type Choice = "A" | "B";
export type Majority = Choice | "=";

export type PlayerStats = {
  score: number;
  currentStreak: number;
  bestStreak: number;
  played: number;
  correct: number;
};

export const EMPTY_STATS: PlayerStats = { score: 0, currentStreak: 0, bestStreak: 0, played: 0, correct: 0 };

export function majorityOf(countA: number, countB: number): Majority {
  if (countA > countB) return "A";
  if (countB > countA) return "B";
  return "=";
}

/**
 * Apply one finalized day to a player's stats.
 * - no bet: streak back to 0 (even on a tie day);
 * - tie with a bet: nothing changes, streak kept;
 * - right side: +1 point, streak +1;
 * - wrong side: streak back to 0.
 */
export function applyDay(s: PlayerStats, choice: Choice | null, majority: Majority): PlayerStats {
  if (choice === null) return { ...s, currentStreak: 0 };
  if (majority === "=") return s;
  if (choice === majority) {
    const streak = s.currentStreak + 1;
    return {
      score: s.score + 1,
      correct: s.correct + 1,
      played: s.played + 1,
      currentStreak: streak,
      bestStreak: Math.max(s.bestStreak, streak),
    };
  }
  return { ...s, played: s.played + 1, currentStreak: 0 };
}

/** Fold every finalized day (ascending) into stats. Days without a question have no result and are skipped. */
export function computeStats(
  results: ReadonlyArray<{ day: string; majority: Majority }>,
  votes: Readonly<Record<string, Choice>>,
): PlayerStats {
  const sorted = [...results].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return sorted.reduce((s, r) => applyDay(s, votes[r.day] ?? null, r.majority), EMPTY_STATS);
}

/** Share of right bets, ties excluded. `null` before the first decided bet. */
export function accuracy(s: PlayerStats): number | null {
  return s.played ? Math.round((100 * s.correct) / s.played) : null;
}

export type Mark = "ok" | "ko" | "wait" | "none";

/**
 * The strip: the 7 previous days, then today only if the player has bet.
 * A bet whose verdict is not out yet shows as "wait".
 */
export function dayMarks(
  today: string,
  votes: Readonly<Record<string, Choice>>,
  results: Readonly<Record<string, Majority>>,
): Mark[] {
  const out: Mark[] = [];
  for (let d = -7; d < 0; d++) {
    const k = addDays(today, d);
    const v = votes[k];
    if (!v) { out.push("none"); continue; }
    const m = results[k];
    if (m === undefined) out.push("wait");
    else if (m === "=") out.push("none");
    else out.push(v === m ? "ok" : "ko");
  }
  if (votes[today]) out.push("wait");
  return out;
}

const SQUARES: Record<Mark, string> = { ok: "🟩", ko: "🟥", wait: "⏳", none: "⬜" };

export function shareText(p: {
  dayNum: number;
  optionA: string;
  optionB: string;
  marks: Mark[];
  stats: PlayerStats;
  url: string;
}): string {
  return (
    "MAJORITÉ #" + p.dayNum + "\n" +
    p.optionA + " ou " + p.optionB + " ?\n" +
    "Mon pari est fait. Et toi, tu sais ce que les gens pensent ?\n" +
    p.marks.map((m) => SQUARES[m]).join("") + "\n" +
    "Série : " + p.stats.currentStreak + " · " + p.stats.score + " pts\n" +
    p.url
  );
}
