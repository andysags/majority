import { Rules } from "@/app/_components/static";
import { LaunchCountdown } from "@/app/_components/launch-countdown";
import { formatDayLong } from "@/lib/game/day";

/** Static first paint while the day's data streams in. */
export function Shell() {
  return (
    <div className="wrap" aria-busy="true">
      <header>
        <div className="mark">Majori<span>té</span></div>
        <div className="meta">Question <b>#…</b><br />Verdict dans <b>--:--:--</b></div>
      </header>
      <section className="card">
        <div className="eyebrow">Question du jour</div>
        <h1 className="question">…</h1>
        <p className="rule">Ne dis pas ce que <em>tu</em> préfères. Parie sur ce que <strong>la majorité</strong> va choisir.</p>
        <div className="choices">
          <button className="choice a" type="button" disabled><span className="tag">A</span><span>…</span></button>
          <button className="choice b" type="button" disabled><span className="tag">B</span><span>…</span></button>
        </div>
        <div className="after"><span className="count">Connexion…</span></div>
      </section>
      <Rules />
    </div>
  );
}

export function PreLaunch({ launch, launchMs, serverNowMs }: { launch: string; launchMs: number; serverNowMs: number }) {
  return (
    <div className="wrap">
      <header>
        <div className="mark">Majori<span>té</span></div>
        <div className="meta">Premier jour<br /><b>{formatDayLong(launch)}</b></div>
      </header>
      <section className="card">
        <div className="eyebrow">Bientôt</div>
        <h1 className="question">Le jeu commence {formatDayLong(launch)}, à minuit (heure de Cotonou).</h1>
        <p className="rule">Ne dis pas ce que <em>tu</em> préfères. Parie sur ce que <strong>la majorité</strong> va choisir.</p>
        <div className="after">
          <span className="count">Ouverture dans <b><LaunchCountdown targetMs={launchMs} serverNowMs={serverNowMs} /></b></span>
        </div>
      </section>
      <Rules />
    </div>
  );
}
