import Link from "next/link";
import type { Question } from "@/lib/data";

export function Rules() {
  return (
    <section className="card">
      <div className="eyebrow">Règles</div>
      <ul className="how">
        <li>Une question par jour, nouvelle à minuit (heure de Cotonou).</li>
        <li>Tu as un seul pari, et il est définitif.</li>
        <li>Si ton camp est majoritaire : +1 point. Égalité parfaite : personne ne marque.</li>
        <li>Les votes restent cachés jusqu&apos;au verdict, pour que personne ne copie.</li>
      </ul>
    </section>
  );
}

export function AdvertiserSpace() {
  return (
    <aside className="sponsor">
      <span className="eyebrow">Espace annonceur</span>
      <strong>Cette question peut porter le nom de ta marque.</strong>
      <span className="note">Une question sponsorisée par jour, vue par tous les joueurs, avec les résultats du vote en bonus.</span>
    </aside>
  );
}

/** "Présentée par …" under the question, when the day has a sponsor. */
export function PresentedBy({ q }: { q: Question }) {
  if (!q.sponsorName) return null;
  const body = (
    <>
      <span>Présentée par</span>
      {q.sponsorLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external sponsor logo, tiny, lazy
        <img src={q.sponsorLogoUrl} alt="" width={24} height={24} loading="lazy" decoding="async" />
      ) : null}
      <strong>{q.sponsorName}</strong>
    </>
  );
  return q.sponsorUrl ? (
    <a className="presented" href={q.sponsorUrl} target="_blank" rel="sponsored noopener noreferrer">{body}</a>
  ) : (
    <div className="presented">{body}</div>
  );
}

export function Mark() {
  return <Link className="mark" href="/">Majori<span>té</span></Link>;
}
