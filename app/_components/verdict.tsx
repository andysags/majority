import type { Question, Verdict } from "@/lib/data";
import type { Choice } from "@/lib/game/scoring";

const pct = (x: number) => Math.round(x * 100) + " %";

type Props = {
  title: string;
  question: Question | null;
  verdict: Verdict | null;
  /** Before launch, or when the verdict is not computed yet (00:00-00:05). */
  state: "before_launch" | "no_question" | "pending" | "ready";
  /** undefined = no personal outcome line (public pages). */
  myPick?: Choice | null;
};

// Same markup as the prototype's renderVerdict().
export function VerdictCard({ title, question, verdict, state, myPick }: Props) {
  return (
    <section className="card verdict" aria-label={title}>
      <div className="eyebrow">{title}</div>
      <VerdictBody question={question} verdict={verdict} state={state} myPick={myPick} />
    </section>
  );
}

function VerdictBody({ question, verdict, state, myPick }: Omit<Props, "title">) {
  if (state === "before_launch") {
    return <p className="note" style={{ marginTop: 8 }}>Le jeu commence aujourd&apos;hui. Premier verdict demain à minuit.</p>;
  }
  if (state === "no_question" || !question) {
    return <p className="note" style={{ marginTop: 8 }}>Pas de question ce jour-là. Le prochain verdict tombe à minuit.</p>;
  }
  const h3 = <h3>{question.optionA} ou {question.optionB} ?</h3>;
  if (state === "pending" || !verdict) {
    return <>{h3}<p className="note">Le verdict est en cours de calcul. Reviens dans quelques minutes.</p></>;
  }
  if (!verdict.total) {
    return <>{h3}<p className="note">Personne n&apos;a parié ce jour-là. Le prochain verdict tombe à minuit.</p></>;
  }
  const pa = verdict.countA / verdict.total;
  const pb = 1 - pa;
  const winner = verdict.majority === "A" ? question.optionA : question.optionB;
  return (
    <>
      {h3}
      <div className="bar" role="img" aria-label={`${question.optionA} ${pct(pa)}, ${question.optionB} ${pct(pb)}`}>
        <div className="ba" style={{ width: pa * 100 + "%" }}>{pa >= 0.12 ? "A " + pct(pa) : ""}</div>
        <div className="bb" style={{ width: pb * 100 + "%" }}>{pb >= 0.12 ? pct(pb) + " B" : ""}</div>
      </div>
      <div className="legend">
        <span>{question.optionA}</span>
        <span style={{ textAlign: "right" }}>{question.optionB}</span>
      </div>
      <p className="note" style={{ marginTop: 6 }}>{verdict.total.toLocaleString("fr-FR")} paris au total</p>
      {verdict.majority === "=" ? (
        <div className="outcome">Égalité parfaite. Personne ne marque.</div>
      ) : myPick === undefined ? (
        <div className="outcome">La majorité a choisi « {winner} ».</div>
      ) : myPick === null ? (
        <div className="outcome muted">Tu n&apos;as pas parié ce jour-là.</div>
      ) : myPick === verdict.majority ? (
        <div className="outcome good">Bien vu : +1 point.</div>
      ) : (
        <div className="outcome bad">Raté. La majorité a choisi « {winner} ».</div>
      )}
    </>
  );
}
