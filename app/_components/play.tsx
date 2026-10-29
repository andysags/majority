"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  castVote, linkEmail, linkGoogle, savePseudo, signInAnonymously, signInWithEmail, signInWithGoogle, type Result,
} from "@/app/actions";
import type { Question } from "@/lib/data";
import { formatCountdown } from "@/lib/game/day";
import { accuracy, shareText, type Choice } from "@/lib/game/scoring";
import type { Me } from "@/lib/me";
import { ERROR_MESSAGES, type ErrorCode } from "@/lib/messages";
import { getTurnstileToken } from "@/lib/turnstile";

export type AuthNotice = "saved" | "signed_in" | "link_invalid" | "identity_taken" | "unexpected";

const AUTH_NOTICES: Record<AuthNotice, { text: string; warn: boolean }> = {
  saved: { text: "Progression sauvegardée. Tu peux maintenant te connecter sur un autre appareil.", warn: false },
  signed_in: { text: "Connecté. Ta progression est de retour.", warn: false },
  link_invalid: { text: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau.", warn: true },
  identity_taken: { text: ERROR_MESSAGES.identity_taken, warn: true },
  unexpected: { text: ERROR_MESSAGES.unexpected, warn: true },
};

type Props = {
  today: string;
  dayNum: number;
  question: Question | null;
  me: Me | null;
  nextDayMs: number;
  serverNowMs: number;
  turnstileSiteKey: string | null;
  siteUrl: string;
  authNotice: AuthNotice | null;
  presentedBy: ReactNode;
  verdict: ReactNode;
  board: ReactNode;
  advertiser: ReactNode;
  rules: ReactNode;
};

const msg = (e: ErrorCode) => ERROR_MESSAGES[e];

export function Play(p: Props) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(p.me);
  const [session, setSession] = useState<"ready" | "connecting" | "failed">(p.me ? "ready" : "connecting");
  const [count, setCount] = useState<number | null>(null);
  const [err, setErr] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Choice | null>(null); // bet waiting for a pseudo
  const [pseudoDraft, setPseudoDraft] = useState("");
  const turnstileBox = useRef<HTMLDivElement>(null);

  // Server props win when they change (router.refresh, new day).
  const [propMe, setPropMe] = useState<Me | null>(p.me);
  if (p.me !== propMe) {
    setPropMe(p.me);
    if (p.me) {
      setMe(p.me);
      setSession("ready");
    }
  }

  // First visit: create the anonymous account.
  useEffect(() => {
    if (p.me) return;
    let cancelled = false;
    (async () => {
      let token: string | null = null;
      if (p.turnstileSiteKey) {
        try {
          token = await getTurnstileToken(p.turnstileSiteKey, turnstileBox.current!);
        } catch (e) {
          console.error(e);
          if (!cancelled) { setSession("failed"); setErr(msg("captcha_failed")); }
          return;
        }
      }
      const r = await signInAnonymously(token);
      if (cancelled) return;
      if (r.ok) { setMe(r.data); setSession("ready"); }
      else { setSession("failed"); setErr(msg(r.error)); }
    })().catch((e) => {
      console.error(e);
      if (!cancelled) { setSession("failed"); setErr(msg("unexpected")); }
    });
    return () => { cancelled = true; };
  }, [p.me, p.turnstileSiteKey]);

  // Live count of bets (number only), refreshed every 30 s while visible.
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/count")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: { count: number }) => { if (alive) setCount((c) => Math.max(c ?? 0, j.count)); })
        .catch((e) => console.warn("count:", e));
    };
    load();
    const t = setInterval(load, 30_000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [p.today]);

  const q = p.question;
  const pick = me?.todayChoice ?? null;
  const ready = session === "ready" && !!me && !!q;

  async function submitVote(choice: Choice, pseudo: string | null) {
    if (pick || saving || !me) return;
    setSaving(true);
    setErr("");
    let r: Result<{ me: Me; day: string }>;
    try {
      r = await castVote(choice, pseudo);
    } catch (e) {
      console.error(e);
      setSaving(false);
      setErr(msg("network"));
      return;
    }
    setSaving(false);
    if (!r.ok) {
      if (r.error === "no_pseudo") { setPending(choice); return; }
      setErr(msg(r.error));
      if (r.error === "already_voted") router.refresh();
      return;
    }
    setPending(null);
    setCount((c) => (c ?? 0) + 1);
    if (r.data.day !== p.today) {
      router.refresh(); // midnight passed while betting
      return;
    }
    setMe(r.data.me);
    router.refresh(); // board and verdict pick up the new pseudo/rank
  }

  function onChoice(choice: Choice) {
    if (!me) return;
    if (!me.pseudo) { setPending(choice); setErr(""); return; }
    void submitVote(choice, null);
  }

  const note = err ? { t: err, warn: true }
    : session === "failed" ? { t: msg("unexpected"), warn: true }
    : !q ? { t: "Pas de question aujourd'hui. Reviens demain.", warn: false }
    : pick ? { t: "Résultat à minuit. Les votes restent cachés jusque-là.", warn: false }
    : { t: "Un seul pari par jour. Choisis bien.", warn: false };

  return (
    <div className="wrap">
      <header>
        <Link className="mark" href="/">Majori<span>té</span></Link>
        <div className="meta">
          Question <b>#{p.dayNum}</b><br />
          Verdict dans <b><Countdown targetMs={p.nextDayMs} serverNowMs={p.serverNowMs} onDone={() => router.refresh()} /></b>
        </div>
      </header>

      {p.authNotice ? <AuthBanner notice={p.authNotice} /> : null}

      <section className="card" aria-labelledby="qText">
        <div className="eyebrow">Question du jour</div>
        <h1 className="question" id="qText">{q ? `${q.optionA} ou ${q.optionB} ?` : "…"}</h1>
        {p.presentedBy}
        <p className="rule">Ne dis pas ce que <em>tu</em> préfères. Parie sur ce que <strong>la majorité</strong> va choisir.</p>
        {q ? (
          <div className="choices">
            {(["A", "B"] as const).map((side) => {
              const picked = pick === side || (!pick && pending === side);
              return (
                <button
                  key={side}
                  className={`choice ${side.toLowerCase()}${picked ? " picked" : ""}${pick && pick !== side ? " dim" : ""}`}
                  type="button"
                  disabled={!!pick || !ready || saving}
                  aria-pressed={pick === side}
                  onClick={() => onChoice(side)}
                >
                  <span className="tag">{side}</span>
                  <span>{side === "A" ? q.optionA : q.optionB}</span>
                  {pick === side ? <span className="lock">Ton pari · verrouillé</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {pending && q && !pick ? (
          <form
            className="stack"
            style={{ marginTop: 16 }}
            onSubmit={(e) => { e.preventDefault(); void submitVote(pending, pseudoDraft); }}
          >
            <label className="f">
              Choisis ton pseudo pour valider ton pari sur « {pending === "A" ? q.optionA : q.optionB} »
              <input
                type="text" autoFocus required minLength={3} maxLength={20} autoComplete="nickname"
                placeholder="Ex. Le Prophète" value={pseudoDraft} onChange={(e) => setPseudoDraft(e.target.value)}
              />
            </label>
            <div className="inline">
              <button className="btn" type="submit" disabled={saving}>Valider mon pari</button>
              <button className="linkish" type="button" onClick={() => { setPending(null); setErr(""); }}>Annuler</button>
            </div>
          </form>
        ) : null}

        <div className="after">
          <div className="row">
            <span className="count">
              {session === "connecting" || count === null ? "Connexion…" : (
                <><b>{count.toLocaleString("fr-FR")}</b> {count > 1 ? "joueurs ont" : "joueur a"} parié aujourd&apos;hui</>
              )}
            </span>
            {pick && q && me ? <ShareButton dayNum={p.dayNum} q={q} me={me} siteUrl={p.siteUrl} /> : null}
          </div>
          <p className={`note${note.warn ? " warn" : ""}`} role={note.warn ? "alert" : undefined}>{note.t}</p>
          <div ref={turnstileBox} />
        </div>
      </section>

      {p.verdict}

      <section aria-label="Tes stats">
        <div className="stats">
          <div className="stat"><div className="v">{me?.stats.score ?? 0}</div><div className="l">points</div></div>
          <div className="stat"><div className="v">{me?.stats.currentStreak ?? 0}</div><div className="l">série en cours</div></div>
          <div className="stat"><div className="v">{me?.stats.bestStreak ?? 0}</div><div className="l">meilleure série</div></div>
          <div className="stat">
            <div className="v">{me && accuracy(me.stats) !== null ? accuracy(me.stats) + " %" : "–"}</div>
            <div className="l">bons paris</div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 10 }}>
          <div className="eyebrow">Tes 7 derniers jours</div>
          <div className="strip" aria-label="Historique des 7 derniers jours">
            {(me?.marks ?? Array(7).fill("none")).map((m, i) => <i key={i} className={m === "none" ? undefined : m} />)}
          </div>
        </div>
      </section>

      {p.board}
      {p.advertiser}

      {me ? <PseudoCard key={me.pseudo ?? ""} me={me} onSaved={(pseudo) => { setMe({ ...me, pseudo }); router.refresh(); }} /> : null}
      {me ? <SaveProgress me={me} turnstileSiteKey={p.turnstileSiteKey} /> : null}

      {p.rules}
    </div>
  );
}

function Countdown({ targetMs, serverNowMs, onDone }: { targetMs: number; serverNowMs: number; onDone: () => void }) {
  // The server gives the deadline and its own clock; the browser only counts down.
  const offset = useRef<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const fired = useRef(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  useEffect(() => {
    if (offset.current === null) offset.current = serverNowMs - Date.now();
    fired.current = false;
    const tick = () => {
      const remaining = targetMs - (Date.now() + (offset.current ?? 0));
      setLeft(remaining);
      if (remaining <= 0 && !fired.current) { fired.current = true; done.current(); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetMs, serverNowMs]);
  return <>{left === null ? "--:--:--" : formatCountdown(left)}</>;
}

function AuthBanner({ notice }: { notice: AuthNotice }) {
  const n = AUTH_NOTICES[notice];
  useEffect(() => {
    // Clean the URL so a reload does not show the message again.
    const u = new URL(window.location.href);
    u.searchParams.delete("auth");
    window.history.replaceState(null, "", u.pathname + u.search);
  }, []);
  return <p className={n.warn ? "note warn" : "toast"} role="status">{n.text}</p>;
}

function ShareButton({ dayNum, q, me, siteUrl }: { dayNum: number; q: Question; me: Me; siteUrl: string }) {
  const [toast, setToast] = useState<string>("");
  const [copy, setCopy] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  async function share() {
    const text = shareText({
      dayNum, optionA: q.optionA, optionB: q.optionB, marks: me.marks, stats: me.stats, url: `${siteUrl}/j/${dayNum}`,
    });
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    if (mobile && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // the player closed the sheet
        console.warn("navigator.share failed, falling back to clipboard", e);
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopy(null);
      setToast("Copié. Colle-le dans ton statut WhatsApp.");
      setTimeout(() => setToast(""), 3500);
    } catch {
      setCopy(text);
      setToast("Copie le texte ci-dessous et colle-le en statut.");
      setTimeout(() => { box.current?.focus(); box.current?.select(); }, 0);
    }
  }

  return (
    <>
      <button className="btn" type="button" onClick={share}>Partager mon pari</button>
      {toast ? <span className="toast" style={{ flexBasis: "100%" }}>{toast}</span> : null}
      {copy !== null ? (
        <textarea ref={box} className="copy" readOnly value={copy} aria-label="Texte à partager" />
      ) : null}
    </>
  );
}

function PseudoCard({ me, onSaved }: { me: Me; onSaved: (pseudo: string) => void }) {
  const [value, setValue] = useState(me.pseudo ?? "");
  const [state, setState] = useState<{ t: string; warn: boolean } | null>(null);
  const [busy, startTransition] = useTransition();

  function save() {
    const v = value.trim();
    if (!v || v === (me.pseudo ?? "")) return;
    startTransition(async () => {
      const r = await savePseudo(v);
      if (r.ok) { setState({ t: "Pseudo enregistré.", warn: false }); onSaved(r.data.pseudo); }
      else setState({ t: msg(r.error), warn: true });
    });
  }

  return (
    <section className="card">
      <label className="f" htmlFor="pseudo">Ton pseudo dans le classement
        <input
          type="text" id="pseudo" maxLength={20} autoComplete="nickname" placeholder="Ex. Le Prophète"
          value={value} disabled={busy} onChange={(e) => setValue(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
        />
      </label>
      <p className={`note${state?.warn ? " warn" : ""}`} style={{ marginTop: 8 }}>
        {state?.t ?? "Enregistré quand tu paries ou quand tu quittes le champ."}
      </p>
    </section>
  );
}

function SaveProgress({ me, turnstileSiteKey }: { me: Me; turnstileSiteKey: string | null }) {
  const [mode, setMode] = useState<"save" | "signin">("save");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ t: string; warn: boolean } | null>(null);
  const [busy, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  if (!me.isAnonymous) {
    return (
      <section className="card">
        <div className="eyebrow">Progression sauvegardée</div>
        <p className="note" style={{ marginTop: 8 }}>
          Ton compte est lié{me.email ? <> à <strong>{me.email}</strong></> : null}. Connecte-toi avec sur un autre appareil pour retrouver tes points.
        </p>
      </section>
    );
  }

  const hasProgress = me.stats.played > 0 || me.stats.score > 0 || !!me.todayChoice;

  function go<T>(action: () => Promise<Result<T>>, onOk: (data: T) => void) {
    setState(null);
    startTransition(async () => {
      try {
        const r = await action();
        if (r.ok) onOk(r.data);
        else setState({ t: msg(r.error), warn: true });
      } catch (e) {
        console.error(e);
        setState({ t: msg("unexpected"), warn: true });
      }
    });
  }

  const redirectTo = (d: { url: string }) => { window.location.assign(d.url); };

  return (
    <section className="card stack">
      <div className="eyebrow">{mode === "save" ? "Sauvegarder ma progression" : "J'ai déjà un compte"}</div>
      {mode === "save" ? (
        <>
          <p className="note">Lie ton compte à Google ou à ton e-mail pour garder tes points sur un autre appareil.</p>
          <div className="inline">
            <button className="btn" type="button" disabled={busy} onClick={() => go(linkGoogle, redirectTo)}>Continuer avec Google</button>
          </div>
          <form className="inline" onSubmit={(e) => {
            e.preventDefault();
            go(() => linkEmail(email), () => setState({ t: "Vérifie ta boîte mail : clique sur le lien pour confirmer ton adresse.", warn: false }));
          }}>
            <input type="email" required autoComplete="email" placeholder="ton@email.com" aria-label="Ton e-mail"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" type="submit" disabled={busy}>Recevoir le lien</button>
          </form>
        </>
      ) : (
        <>
          <p className="note">Connecte-toi pour retrouver les points de ton compte sur cet appareil.</p>
          {hasProgress ? (
            <p className="note warn">Attention : la progression de cet appareil ({me.stats.score} pt{me.stats.score > 1 ? "s" : ""}) sera remplacée par celle de ton compte.</p>
          ) : null}
          <div className="inline">
            <button className="btn" type="button" disabled={busy} onClick={() => go(signInWithGoogle, redirectTo)}>Se connecter avec Google</button>
          </div>
          <form className="inline" onSubmit={(e) => {
            e.preventDefault();
            go(async () => {
              const token = turnstileSiteKey ? await getTurnstileToken(turnstileSiteKey, box.current!) : null;
              return signInWithEmail(email, token);
            }, () => setState({ t: "Vérifie ta boîte mail : le lien de connexion vient d'être envoyé.", warn: false }));
          }}>
            <input type="email" required autoComplete="email" placeholder="ton@email.com" aria-label="Ton e-mail"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn" type="submit" disabled={busy}>Recevoir le lien</button>
          </form>
          <div ref={box} />
        </>
      )}
      {state ? <p className={state.warn ? "note warn" : "toast"} role="status">{state.t}</p> : null}
      <button className="linkish" type="button" onClick={() => { setMode(mode === "save" ? "signin" : "save"); setState(null); }}>
        {mode === "save" ? "J'ai déjà un compte" : "Revenir à la sauvegarde"}
      </button>
    </section>
  );
}
