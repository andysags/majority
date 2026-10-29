import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { saveQuestion } from "@/app/admin/actions";
import { AdminSignIn } from "@/app/admin/sign-in";
import { adminGate } from "@/lib/admin-auth";
import { requestNow } from "@/lib/clock";
import { env } from "@/lib/env";
import { addDays, dayKeyAt, dayNumber, formatDayLong, formatDayShort } from "@/lib/game/day";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Majorité", robots: { index: false, follow: false } };

type QuestionRow = {
  day: string; option_a: string; option_b: string;
  sponsor_name: string | null; sponsor_url: string | null; sponsor_logo_url: string | null;
};
type StatRow = {
  day: string; players: number; count_a: number | null; count_b: number | null;
  majority: string | null; new_players: number; finalized: boolean;
};

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<div className="wrap"><p className="note">Chargement…</p></div>}>
      <Admin searchParams={searchParams} />
    </Suspense>
  );
}

async function Admin({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const now = await requestNow();
  const gate = await adminGate();
  if (gate.state === "sign_in") {
    return (
      <div className="wrap">
        <header>
          <Link className="mark" href="/">Majori<span>té</span></Link>
          <div className="meta">Admin</div>
        </header>
        <AdminSignIn turnstileSiteKey={env.turnstileSiteKey()} />
      </div>
    );
  }
  const { email } = gate;
  const sp = await searchParams;
  const today = dayKeyAt(now);
  const launch = env.launchDate();
  const from = today > launch ? today : launch;
  const to = addDays(from, 29);
  const db = createAdminClient();

  const [qs, stats] = await Promise.all([
    db.from("questions").select("day, option_a, option_b, sponsor_name, sponsor_url, sponsor_logo_url")
      .gte("day", from).lte("day", to).order("day"),
    db.rpc("admin_daily_stats", { p_from: addDays(today, -30) < launch ? launch : addDays(today, -30), p_to: today }),
  ]);
  if (qs.error) throw new Error(`admin questions: ${qs.error.message}`);
  if (stats.error) throw new Error(`admin_daily_stats: ${stats.error.message}`);

  const byDay = new Map((qs.data as QuestionRow[]).map((q) => [q.day, q]));
  const days = Array.from({ length: 30 }, (_, i) => addDays(from, i));
  const missing = days.filter((d) => !byDay.has(d));
  const warnings = [
    !env.turnstileSiteKey() && "Turnstile n'est pas configuré (TURNSTILE_SITE_KEY) : les comptes anonymes ne sont pas protégés contre les robots.",
    !env.clarityId() && "Microsoft Clarity n'est pas configuré (CLARITY_PROJECT_ID) : pas de statistiques de visite.",
  ].filter(Boolean) as string[];

  const saved = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const openDay = typeof sp.day === "string" ? sp.day : null;

  return (
    <div className="wrap wide">
      <header>
        <Link className="mark" href="/">Majori<span>té</span></Link>
        <div className="meta">Admin<br /><b>{email}</b></div>
      </header>

      {error ? <p className="note warn" role="alert">{error}</p> : null}
      {saved ? <p className="toast" role="status">Question du {formatDayLong(saved)} enregistrée.</p> : null}

      {missing.length || warnings.length ? (
        <section className="card stack" aria-label="Alertes">
          <div className="eyebrow">Alertes</div>
          {missing.length ? (
            <p className="note warn">
              Il manque une question pour {missing.length} jour{missing.length > 1 ? "s" : ""} à venir :{" "}
              {missing.slice(0, 10).map(formatDayShort).join(", ")}{missing.length > 10 ? "…" : ""}.
              {missing[0] === today ? " Y compris aujourd'hui : personne ne peut jouer !" : ""}
            </p>
          ) : null}
          {warnings.map((w) => <p className="note warn" key={w}>{w}</p>)}
        </section>
      ) : null}

      <section className="card" id="calendrier">
        <div className="eyebrow">Calendrier · 30 prochains jours</div>
        <ol className="board">
          {days.map((d) => {
            const q = byDay.get(d);
            return (
              <li key={d} style={{ display: "block" }}>
                <details open={openDay === d}>
                  <summary style={{ cursor: "pointer" }}>
                    <span className="rk">#{dayNumber(d, launch)}</span>{" "}
                    <strong>{formatDayShort(d)}</strong>{d === today ? " (aujourd'hui)" : ""} ·{" "}
                    {q ? <>{q.option_a} ou {q.option_b} ?{q.sponsor_name ? <em> · {q.sponsor_name}</em> : null}</>
                      : <span className="note warn" style={{ display: "inline" }}>Pas de question</span>}
                  </summary>
                  <form action={saveQuestion} className="stack" style={{ margin: "12px 0" }}>
                    <input type="hidden" name="day" value={d} />
                    <label className="f">Choix A<input type="text" name="option_a" required maxLength={80} defaultValue={q?.option_a ?? ""} /></label>
                    <label className="f">Choix B<input type="text" name="option_b" required maxLength={80} defaultValue={q?.option_b ?? ""} /></label>
                    <label className="f">Sponsor (nom)<input type="text" name="sponsor_name" maxLength={60} defaultValue={q?.sponsor_name ?? ""} /></label>
                    <label className="f">Lien du sponsor<input type="url" name="sponsor_url" placeholder="https://…" defaultValue={q?.sponsor_url ?? ""} /></label>
                    <label className="f">Logo du sponsor (URL d&apos;image)<input type="url" name="sponsor_logo_url" placeholder="https://…" defaultValue={q?.sponsor_logo_url ?? ""} /></label>
                    <div className="inline"><button className="btn" type="submit">{q ? "Enregistrer" : "Créer la question"}</button></div>
                  </form>
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card">
        <div className="eyebrow">Stats par jour</div>
        <div style={{ overflowX: "auto" }}>
          <table className="stats-table">
            <thead>
              <tr><th>Jour</th><th>Joueurs</th><th>A</th><th>B</th><th>Majorité</th><th>Nouveaux</th></tr>
            </thead>
            <tbody>
              {(stats.data as StatRow[]).map((r) => (
                <tr key={r.day}>
                  <td>#{dayNumber(r.day, launch)} · {formatDayShort(r.day)}</td>
                  <td>{r.players.toLocaleString("fr-FR")}</td>
                  {r.finalized && r.players ? (
                    <>
                      <td>{Math.round((100 * (r.count_a ?? 0)) / r.players)} %</td>
                      <td>{Math.round((100 * (r.count_b ?? 0)) / r.players)} %</td>
                    </>
                  ) : (
                    <td colSpan={2} className="note">{r.finalized ? "–" : "au verdict"}</td>
                  )}
                  <td>{r.majority ?? "–"}</td>
                  <td>{r.new_players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
