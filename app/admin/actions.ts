"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { questionTag } from "@/lib/data";
import { requireAdmin } from "@/lib/admin-auth";
import { assertDayKey } from "@/lib/game/day";
import { createAdminClient } from "@/lib/supabase/admin";

function field(form: FormData, name: string): string | null {
  const v = form.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function back(params: Record<string, string>): never {
  redirect(`/admin?${new URLSearchParams(params).toString()}#calendrier`);
}

export async function saveQuestion(form: FormData) {
  await requireAdmin();

  const rawDay = field(form, "day") ?? "";
  let day: string;
  try {
    day = assertDayKey(rawDay);
  } catch {
    back({ error: "Date invalide." });
  }
  const optionA = field(form, "option_a");
  const optionB = field(form, "option_b");
  const sponsorName = field(form, "sponsor_name");
  const sponsorUrl = field(form, "sponsor_url");
  const sponsorLogoUrl = field(form, "sponsor_logo_url");

  if (!optionA || !optionB || optionA.length > 80 || optionB.length > 80) {
    back({ error: `${day} : les deux choix sont obligatoires (80 caractères max).`, day });
  }
  if (optionA.toLowerCase() === optionB.toLowerCase()) back({ error: `${day} : les deux choix doivent être différents.`, day });
  if (sponsorName && sponsorName.length > 60) back({ error: `${day} : nom du sponsor trop long (60 max).`, day });
  for (const u of [sponsorUrl, sponsorLogoUrl]) {
    if (u && !/^https:\/\/\S+$/.test(u)) back({ error: `${day} : les liens doivent commencer par https://`, day });
  }
  if ((sponsorUrl || sponsorLogoUrl) && !sponsorName) back({ error: `${day} : indique le nom du sponsor.`, day });

  const { error } = await createAdminClient()
    .from("questions")
    .upsert(
      {
        day,
        option_a: optionA,
        option_b: optionB,
        sponsor_name: sponsorName,
        sponsor_url: sponsorUrl,
        sponsor_logo_url: sponsorLogoUrl,
      },
      { onConflict: "day" },
    );
  if (error) {
    if (error.message.includes("question_in_past")) back({ error: `${day} : impossible de modifier un jour passé.`, day });
    console.error("admin saveQuestion:", error);
    back({ error: `${day} : enregistrement impossible (${error.message}).`, day });
  }
  updateTag(questionTag(day));
  back({ saved: day });
}
