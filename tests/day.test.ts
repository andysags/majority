import { describe, expect, it } from "vitest";
import {
  addDays, dayFromNumber, dayKeyAt, dayNumber, dayStartMs, formatCountdown, nextDayStartMs, weekStart,
} from "@/lib/game/day";

const at = (iso: string) => Date.parse(iso);

describe("game day (Africa/Porto-Novo, UTC+1)", () => {
  it("switches at local midnight, i.e. 23:00 UTC", () => {
    expect(dayKeyAt(at("2026-11-02T22:59:59.999Z"))).toBe("2026-11-02");
    expect(dayKeyAt(at("2026-11-02T23:00:00.000Z"))).toBe("2026-11-03");
  });

  it("is already tomorrow in Cotonou while still today in UTC", () => {
    expect(new Date(at("2026-11-02T23:30:00Z")).toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(dayKeyAt(at("2026-11-02T23:30:00Z"))).toBe("2026-11-03");
  });

  it("does not depend on the machine time zone", () => {
    // Asserted against fixed instants; Intl uses the named zone, not process TZ.
    expect(dayKeyAt(at("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
    expect(dayKeyAt(at("2026-12-31T22:59:59Z"))).toBe("2026-12-31");
  });

  it("handles month and leap-year boundaries", () => {
    expect(dayKeyAt(at("2028-02-28T23:00:00Z"))).toBe("2028-02-29");
    expect(dayKeyAt(at("2028-02-29T23:00:00Z"))).toBe("2028-03-01");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("has no daylight saving: the offset is UTC+1 all year", () => {
    expect(dayStartMs("2026-01-15")).toBe(at("2026-01-14T23:00:00Z"));
    expect(dayStartMs("2026-07-15")).toBe(at("2026-07-14T23:00:00Z"));
  });

  it("computes the next midnight", () => {
    expect(nextDayStartMs(at("2026-11-02T10:00:00Z"))).toBe(at("2026-11-02T23:00:00Z"));
    expect(nextDayStartMs(at("2026-11-02T23:00:00Z"))).toBe(at("2026-11-03T23:00:00Z"));
    expect(nextDayStartMs(at("2026-11-02T22:59:59Z"))).toBe(at("2026-11-02T23:00:00Z"));
  });

  it("numbers days from the launch date", () => {
    expect(dayNumber("2026-11-02", "2026-11-02")).toBe(1);
    expect(dayNumber("2026-12-16", "2026-11-02")).toBe(45);
    expect(dayNumber("2026-11-01", "2026-11-02")).toBe(0);
    expect(dayFromNumber(45, "2026-11-02")).toBe("2026-12-16");
    expect(() => dayFromNumber(0, "2026-11-02")).toThrow();
    expect(() => dayFromNumber(1.5, "2026-11-02")).toThrow();
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-11-02")).toBe("2026-11-02"); // Monday
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-10-29")).toBe("2026-10-26"); // Thursday
  });

  it("formats the countdown", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });

  it("rejects malformed day keys", () => {
    expect(() => addDays("2026-13-01", 1)).toThrow();
    expect(() => addDays("02/11/2026", 1)).toThrow();
  });
});
