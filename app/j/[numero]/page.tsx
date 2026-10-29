import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Rules } from "@/app/_components/static";
import { VerdictCard } from "@/app/_components/verdict";
import { requestNow } from "@/lib/clock";
import { getQuestion, getVerdict } from "@/lib/data";
import { env } from "@/lib/env";
import { dayFromNumber, dayKeyAt, formatDayLong } from "@/lib/game/day";

// Shareable page of a day: the question and, once the day is over, its verdict.

function parseNumero(raw: string): number | null {
  if (!/^[1-9]\d{0,4}$/.test(raw)) return null;
  return Number(raw);
}

export async function generateMetadata({ params }: PageProps<"/j/[numero]">): Promise<Metadata> {
  const n = parseNumero((await params).numero);
  if (!n) return { title: "Majorité" };
  // Future questions are hidden by RLS, so this never leaks one.
  const q = await getQuestion(dayFromNumber(n, env.launchDate()));
  if (!q) return { title: `Majorité #${n}` };
  const title = `Majorité #${n} · ${q.optionA} ou ${q.optionB} ?`;
  const description = "Ne dis pas ce que tu préfères : parie sur ce que la majorité va choisir.";
  return { title, description, openGraph: { title, description, url: `/j/${n}` }, twitter: { title, description } };
}

export default function DayPage({ params }: PageProps<"/j/[numero]">) {
  return (
    <Suspense fallback={<div className="wrap"><header><div className="mark">Majori<span>té</span></div></header></div>}>
      <Day params={params} />
    </Suspense>
  );
}

async function Day({ params }: { params: PageProps<"/j/[numero]">["params"] }) {
  const now = await requestNow();
  const n = parseNumero((await params).numero);
  if (!n) notFound();
  const day = dayFromNumber(n, env.launchDate());
  const today = dayKeyAt(now);
  if (day > today) notFound();
  const [q, verdict] = await Promise.all([getQuestion(day), day < today ? getVerdict(day) : Promise.resolve(null)]);
  if (!q) notFound();
  const isToday = day === today;

  return (
    <div className="wrap">
      <header>
        <Link className="mark" href="/">Majori<span>té</span></Link>
        <div className="meta">Question <b>#{n}</b><br />{formatDayLong(day)}</div>
      </header>
      <section className="card">
        <div className="eyebrow">{isToday ? "Question du jour" : `Question #${n}`}</div>
        <h1 className="question">{q.optionA} ou {q.optionB} ?</h1>
        <p className="rule">Ne dis pas ce que <em>tu</em> préfères. Parie sur ce que <strong>la majorité</strong> va choisir.</p>
        <div className="choices">
          <div className="choice a static"><span className="tag">A</span><span>{q.optionA}</span></div>
          <div className="choice b static"><span className="tag">B</span><span>{q.optionB}</span></div>
        </div>
        <div className="after">
          <div className="row">
            <span className="note">{isToday ? "Les votes restent cachés jusqu'à minuit." : "Une nouvelle question chaque jour."}</span>
            <Link className="btn" href="/">{isToday ? "Je parie" : "Jouer aujourd'hui"}</Link>
          </div>
        </div>
      </section>
      {!isToday ? <VerdictCard title="Verdict" question={q} verdict={verdict} state={verdict ? "ready" : "pending"} /> : null}
      <Rules />
    </div>
  );
}
