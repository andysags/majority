import type { BoardRow } from "@/lib/data";
import type { Me } from "@/lib/me";

type Props = { all: BoardRow[]; week: BoardRow[]; me: Me | null };

// Top 50 (general and this week); the player's own row is always shown.
export function BoardCard({ all, week, me }: Props) {
  return (
    <section className="card" aria-labelledby="bTitle">
      <div className="eyebrow" id="bTitle">Classement</div>
      <div className="tabs">
        <input type="radio" name="board" id="tab-all" defaultChecked />
        <input type="radio" name="board" id="tab-week" />
        <div className="tablist">
          <label htmlFor="tab-all">Général</label>
          <label htmlFor="tab-week">Semaine</label>
        </div>
        <div className="panel all">
          <BoardList rows={all} me={me} myRank={me?.rankAll ?? null} myScore={me?.stats.score ?? 0}
            empty="Personne n'a encore de point. Le premier verdict lancera le classement." />
        </div>
        <div className="panel week">
          <BoardList rows={week} me={me} myRank={me?.rankWeek ?? null} myScore={me?.weekScore ?? 0}
            empty="Personne n'a encore marqué cette semaine (du lundi au dimanche)." />
        </div>
      </div>
    </section>
  );
}

function BoardList({ rows, me, myRank, myScore, empty }: {
  rows: BoardRow[]; me: Me | null; myRank: number | null; myScore: number; empty: string;
}) {
  const mineInTop = me ? rows.some((r) => r.userId === me.userId) : false;
  const showMe = !!me?.pseudo && !mineInTop;
  if (!rows.length && !showMe) {
    return <p className="note" style={{ marginTop: 8 }}>{empty}</p>;
  }
  return (
    <ol className="board">
      {rows.map((r) => (
        <Line key={r.userId} rank={String(r.rank)} name={r.pseudo} streak={r.streak} score={r.score} isMe={r.userId === me?.userId} />
      ))}
      {showMe && me ? (
        <Line rank={myRank ? String(myRank) : "–"} name={me.pseudo ?? ""} streak={me.stats.currentStreak}
          score={myScore} isMe gap={rows.length > 0} />
      ) : null}
    </ol>
  );
}

function Line({ rank, name, streak, score, isMe, gap }: {
  rank: string; name: string; streak: number; score: number; isMe: boolean; gap?: boolean;
}) {
  const cls = [isMe ? "me" : "", gap ? "gap" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <li className={cls}>
      <span className="rk">{rank}</span>
      <span className="nm">{name}{isMe ? " (toi)" : ""}</span>
      <span className="st">{streak ? "série " + streak : ""}</span>
      <span className="sc">{score} pt{score > 1 ? "s" : ""}</span>
    </li>
  );
}
