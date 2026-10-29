"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCountdown } from "@/lib/game/day";

/** Countdown to a server-given instant; reloads the page data when it is reached. */
export function LaunchCountdown({ targetMs, serverNowMs }: { targetMs: number; serverNowMs: number }) {
  const router = useRouter();
  const offset = useRef<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (offset.current === null) offset.current = serverNowMs - Date.now();
    let fired = false;
    const tick = () => {
      const remaining = targetMs - (Date.now() + (offset.current ?? 0));
      setLeft(remaining);
      if (remaining <= 0 && !fired) { fired = true; router.refresh(); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetMs, serverNowMs, router]);
  const s = left === null ? null : Math.max(0, Math.floor(left / 1000));
  if (s === null) return <>…</>;
  const days = Math.floor(s / 86400);
  return <>{days > 0 ? `${days} j ` : ""}{formatCountdown((s % 86400) * 1000)}</>;
}
