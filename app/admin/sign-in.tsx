"use client";

import { useRef, useState, useTransition } from "react";
import { adminSignInWithEmail, adminSignInWithGoogle } from "@/app/admin/sign-in-actions";
import { getTurnstileToken } from "@/lib/turnstile";

export function AdminSignIn({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ t: string; warn: boolean } | null>(null);
  const [busy, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  return (
    <section className="card stack">
      <div className="eyebrow">Espace admin</div>
      <p className="note">Connecte-toi avec une adresse autorisée.</p>
      <div className="inline">
        <button className="btn" type="button" disabled={busy} onClick={() => startTransition(async () => {
          const r = await adminSignInWithGoogle();
          if (r.ok && r.url) window.location.assign(r.url);
          else if (!r.ok) setState({ t: r.message, warn: true });
        })}>Se connecter avec Google</button>
      </div>
      <form className="inline" onSubmit={(e) => {
        e.preventDefault();
        setState(null);
        startTransition(async () => {
          try {
            const token = turnstileSiteKey ? await getTurnstileToken(turnstileSiteKey, box.current!) : null;
            const r = await adminSignInWithEmail(email, token);
            setState(r.ok
              ? { t: "Si cette adresse est autorisée, un lien de connexion vient d'être envoyé.", warn: false }
              : { t: r.message, warn: true });
          } catch (err) {
            console.error(err);
            setState({ t: "La vérification anti-robot a échoué. Recharge la page.", warn: true });
          }
        });
      }}>
        <input type="email" required autoComplete="email" placeholder="ton@email.com" aria-label="E-mail"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn" type="submit" disabled={busy}>Recevoir le lien</button>
      </form>
      <div ref={box} />
      {state ? <p className={state.warn ? "note warn" : "toast"} role="status">{state.t}</p> : null}
    </section>
  );
}
