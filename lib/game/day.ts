// Game calendar. A "day key" is an ISO date string (YYYY-MM-DD) in the
// Africa/Porto-Novo time zone. These helpers run on the server only: the
// browser never decides which day it is.

export const GAME_TIME_ZONE = "Africa/Porto-Novo";

const DAY_MS = 86_400_000;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: GAME_TIME_ZONE,
  timeZoneName: "longOffset",
});

export function assertDayKey(key: string): string {
  if (!DAY_KEY_RE.test(key) || Number.isNaN(Date.parse(key + "T00:00:00Z"))) {
    throw new Error(`Invalid day key: ${JSON.stringify(key)}`);
  }
  return key;
}

/** Day key of the game for a given instant. */
export function dayKeyAt(nowMs: number): string {
  return dayFormatter.format(new Date(nowMs));
}

/** Offset of the game time zone from UTC at a given instant, in ms. */
function tzOffsetMs(atMs: number): number {
  const name = offsetFormatter
    .formatToParts(new Date(atMs))
    .find((p) => p.type === "timeZoneName")?.value;
  if (name === "GMT") return 0;
  const m = name?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Unexpected time zone offset: ${name}`);
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 3_600_000 + Number(m[3]) * 60_000);
}

/** UTC instant at which a given game day starts (local midnight). */
export function dayStartMs(key: string): number {
  const utcMidnight = Date.parse(assertDayKey(key) + "T00:00:00Z");
  return utcMidnight - tzOffsetMs(utcMidnight);
}

/** UTC instant of the next local midnight after `nowMs`. */
export function nextDayStartMs(nowMs: number): number {
  return dayStartMs(addDays(dayKeyAt(nowMs), 1));
}

export function addDays(key: string, n: number): string {
  const t = Date.parse(assertDayKey(key) + "T00:00:00Z") + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(assertDayKey(a) + "T00:00:00Z") - Date.parse(assertDayKey(b) + "T00:00:00Z")) / DAY_MS,
  );
}

/** Day #1 is the launch date. */
export function dayNumber(key: string, launch: string): number {
  return diffDays(key, launch) + 1;
}

export function dayFromNumber(n: number, launch: string): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid day number: ${n}`);
  return addDays(launch, n - 1);
}

/** Monday of the week containing `key` (weeks run Monday to Sunday). */
export function weekStart(key: string): string {
  const dow = new Date(assertDayKey(key) + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

/** "HH:MM:SS" until `targetMs`, clamped at zero. */
export function formatCountdown(remainingMs: number): string {
  const s = Math.max(0, Math.floor(remainingMs / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const frDay = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const frShort = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" });

/** "lundi 2 novembre" */
export function formatDayLong(key: string): string {
  return frDay.format(new Date(assertDayKey(key) + "T00:00:00Z"));
}

/** "2 nov." */
export function formatDayShort(key: string): string {
  return frShort.format(new Date(assertDayKey(key) + "T00:00:00Z"));
}
