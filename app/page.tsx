import { Suspense } from "react";
import { BoardCard } from "@/app/_components/board";
import { Play, type AuthNotice } from "@/app/_components/play";
import { AdvertiserSpace, PresentedBy, Rules } from "@/app/_components/static";
import { VerdictCard } from "@/app/_components/verdict";
import { Shell, PreLaunch } from "@/app/_components/shell";
import { requestNow } from "@/lib/clock";
import { getBoards, getQuestion, getVerdict } from "@/lib/data";
import { env } from "@/lib/env";
import { addDays, dayKeyAt, dayNumber, dayStartMs, nextDayStartMs } from "@/lib/game/day";
import { getMe } from "@/lib/me";

const NOTICES = new Set<AuthNotice>(["saved", "signed_in", "link_invalid", "identity_taken", "unexpected"]);

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Shell />}>
      <Today searchParams={searchParams} />
    </Suspense>
  );
}

async function Today({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const now = await requestNow(); // the game day depends on the request time, never on the build
  const today = dayKeyAt(now);
  const yesterday = addDays(today, -1);
  const launch = env.launchDate();

  if (today < launch) {
    return <PreLaunch launch={launch} launchMs={dayStartMs(launch)} serverNowMs={now} />;
  }

  const [question, yQuestion, yVerdict, boards, me, sp] = await Promise.all([
    getQuestion(today),
    yesterday >= launch ? getQuestion(yesterday) : Promise.resolve(null),
    yesterday >= launch ? getVerdict(yesterday) : Promise.resolve(null),
    getBoards(today, yesterday),
    getMe(today),
    searchParams,
  ]);

  const authParam = typeof sp.auth === "string" ? (sp.auth as AuthNotice) : null;
  const verdictState = yesterday < launch ? "before_launch" : !yQuestion ? "no_question" : !yVerdict ? "pending" : "ready";

  return (
    <Play
      today={today}
      dayNum={dayNumber(today, launch)}
      question={question}
      me={me}
      nextDayMs={nextDayStartMs(now)}
      serverNowMs={now}
      turnstileSiteKey={env.turnstileSiteKey()}
      siteUrl={env.siteUrl()}
      authNotice={authParam && NOTICES.has(authParam) ? authParam : null}
      presentedBy={question ? <PresentedBy q={question} /> : null}
      verdict={
        <VerdictCard title="Verdict d'hier" question={yQuestion} verdict={yVerdict} state={verdictState}
          myPick={me ? me.yesterdayChoice : undefined} />
      }
      board={<BoardCard all={boards.all} week={boards.week} me={me} />}
      advertiser={question?.sponsorName ? null : <AdvertiserSpace />}
      rules={<Rules />}
    />
  );
}
