/**
 * Imports the 45 launch questions, one per day from LAUNCH_DATE (day #1).
 * Existing days are never overwritten (admin edits win).
 *
 *   pnpm seed:questions          # inserts through the API (SUPABASE_URL + SUPABASE_SECRET_KEY)
 *   pnpm seed:questions --sql    # prints the SQL instead (for the SQL editor or psql)
 *
 * Through the API, days before today are refused by the database (a question
 * can't be created in the past); use --sql as postgres for those.
 */
import { createClient } from "@supabase/supabase-js";
import { addDays, assertDayKey } from "../lib/game/day";
import { LAUNCH_QUESTIONS } from "../lib/game/questions";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

const launch = assertDayKey(need("LAUNCH_DATE"));
const rows = LAUNCH_QUESTIONS.map(([a, b], i) => ({ day: addDays(launch, i), option_a: a, option_b: b }));

if (process.argv.includes("--sql")) {
  const lit = (s: string) => "'" + s.replace(/'/g, "''") + "'";
  console.log("insert into public.questions (day, option_a, option_b) values");
  console.log(rows.map((r) => `  (${lit(r.day)}, ${lit(r.option_a)}, ${lit(r.option_b)})`).join(",\n"));
  console.log("on conflict (day) do nothing;");
} else {
  const db = createClient(need("SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
  const { data, error } = await db
    .from("questions")
    .upsert(rows, { onConflict: "day", ignoreDuplicates: true })
    .select("day");
  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
  console.log(`Inserted ${data.length} new question(s) from ${rows[0].day} to ${rows[rows.length - 1].day}.`);
}
