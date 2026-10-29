import { describe, expect, it } from "vitest";
import {
  accuracy, applyDay, computeStats, dayMarks, EMPTY_STATS, majorityOf, shareText, type Choice, type Majority,
} from "@/lib/game/scoring";

describe("verdict", () => {
  it("picks the larger side, '=' on a perfect tie", () => {
    expect(majorityOf(3, 2)).toBe("A");
    expect(majorityOf(2, 3)).toBe("B");
    expect(majorityOf(2, 2)).toBe("=");
    expect(majorityOf(0, 0)).toBe("=");
  });
});

describe("points and streak", () => {
  it("gives +1 and extends the streak on the right side", () => {
    const s = applyDay(EMPTY_STATS, "A", "A");
    expect(s).toEqual({ score: 1, correct: 1, played: 1, currentStreak: 1, bestStreak: 1 });
  });

  it("resets the streak on a wrong bet but keeps the best streak", () => {
    let s = applyDay(EMPTY_STATS, "A", "A");
    s = applyDay(s, "B", "B");
    s = applyDay(s, "A", "B");
    expect(s).toEqual({ score: 2, correct: 2, played: 3, currentStreak: 0, bestStreak: 2 });
  });

  it("on a tie: nobody scores and the streak is not broken", () => {
    let s = applyDay(EMPTY_STATS, "A", "A");
    s = applyDay(s, "B", "=");
    expect(s).toEqual({ score: 1, correct: 1, played: 1, currentStreak: 1, bestStreak: 1 });
    s = applyDay(s, "A", "A");
    expect(s.currentStreak).toBe(2);
  });

  it("a day without a bet resets the streak, even a tie day", () => {
    let s = applyDay(EMPTY_STATS, "A", "A");
    s = applyDay(s, null, "B");
    expect(s.currentStreak).toBe(0);
    s = applyDay(applyDay(EMPTY_STATS, "A", "A"), null, "=");
    expect(s.currentStreak).toBe(0);
    expect(s.score).toBe(1);
  });

  it("days without a question (no result) do not touch the streak", () => {
    const results: { day: string; majority: Majority }[] = [
      { day: "2026-11-02", majority: "A" },
      // 2026-11-03: no question, so no result row
      { day: "2026-11-04", majority: "B" },
    ];
    const votes: Record<string, Choice> = { "2026-11-02": "A", "2026-11-04": "B" };
    expect(computeStats(results, votes)).toEqual({ score: 2, correct: 2, played: 2, currentStreak: 2, bestStreak: 2 });
  });

  it("folds days in date order whatever the input order", () => {
    const results: { day: string; majority: Majority }[] = [
      { day: "2026-11-04", majority: "A" },
      { day: "2026-11-02", majority: "A" },
      { day: "2026-11-03", majority: "A" },
    ];
    const votes: Record<string, Choice> = { "2026-11-02": "B", "2026-11-03": "A", "2026-11-04": "A" };
    expect(computeStats(results, votes).currentStreak).toBe(2);
  });

  it("accuracy ignores ties", () => {
    let s = applyDay(EMPTY_STATS, "A", "A");
    s = applyDay(s, "A", "=");
    s = applyDay(s, "A", "B");
    expect(accuracy(s)).toBe(50);
    expect(accuracy(EMPTY_STATS)).toBeNull();
  });
});

describe("7-day strip and share text", () => {
  const today = "2026-11-10";
  const votes: Record<string, Choice> = {
    "2026-11-03": "A", // right
    "2026-11-04": "B", // wrong
    "2026-11-05": "A", // tie
    "2026-11-09": "B", // verdict pending
    "2026-11-10": "A", // today
  };
  const results: Record<string, Majority> = {
    "2026-11-03": "A", "2026-11-04": "A", "2026-11-05": "=", "2026-11-06": "B",
  };

  it("shows 7 past days then today's pending bet", () => {
    expect(dayMarks(today, votes, results)).toEqual(["ok", "ko", "none", "none", "none", "none", "wait", "wait"]);
  });

  it("has 7 squares when the player has not bet today", () => {
    const rest = Object.fromEntries(Object.entries(votes).filter(([d]) => d !== today));
    expect(dayMarks(today, rest, results)).toHaveLength(7);
  });

  it("builds the prototype share text plus the link", () => {
    const txt = shareText({
      dayNum: 9, optionA: "Thé", optionB: "Café", marks: ["ok", "ko", "none", "wait"],
      stats: { ...EMPTY_STATS, score: 3, currentStreak: 1 }, url: "https://majorite.example/j/9",
    });
    expect(txt).toBe(
      "MAJORITÉ #9\nThé ou Café ?\nMon pari est fait. Et toi, tu sais ce que les gens pensent ?\n🟩🟥⬜⏳\nSérie : 1 · 3 pts\nhttps://majorite.example/j/9",
    );
  });
});
