import { getQuestion } from "@/lib/data";
import { env } from "@/lib/env";
import { dayFromNumber } from "@/lib/game/day";
import { OG_SIZE, renderDayImage } from "@/lib/og";

export const alt = "Majorité, la question du jour";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ numero: string }> }) {
  const raw = (await params).numero;
  const n = /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : null;
  // Future questions are hidden by RLS: an image for a future day shows no question.
  const q = n ? await getQuestion(dayFromNumber(n, env.launchDate())) : null;
  return renderDayImage({ dayNum: n, optionA: q?.optionA ?? null, optionB: q?.optionB ?? null, caption: n ? `Question #${n}` : "Majorité" });
}
