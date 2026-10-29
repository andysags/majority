import { requestNow } from "@/lib/clock";
import { getQuestion } from "@/lib/data";
import { env } from "@/lib/env";
import { dayKeyAt, dayNumber } from "@/lib/game/day";
import { OG_SIZE, renderDayImage } from "@/lib/og";

export const alt = "Majorité, la question du jour";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const today = dayKeyAt(await requestNow());
  const launch = env.launchDate();
  if (today < launch) return renderDayImage({ dayNum: null, optionA: null, optionB: null, caption: "Bientôt" });
  const q = await getQuestion(today);
  return renderDayImage({ dayNum: dayNumber(today, launch), optionA: q?.optionA ?? null, optionB: q?.optionB ?? null, caption: "Question du jour" });
}
