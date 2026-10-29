import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const fonts = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/Unbounded-ExtraBold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Unbounded-SemiBold.ttf")),
  readFile(join(process.cwd(), "assets/fonts/InstrumentSans-SemiBold.ttf")),
]);

// Light theme tokens of the game.
const C = { bg: "#EAF0EF", surface: "#FFFFFF", ink: "#0F201E", muted: "#56706C", line: "#CFDBD9", a: "#0F766E", onA: "#FFFFFF", b: "#F2B705", onB: "#1C1600" };

export async function renderDayImage(p: { dayNum: number | null; optionA: string | null; optionB: string | null; caption: string }) {
  const [display800, display600, body] = await fonts;
  const question = p.optionA && p.optionB ? `${p.optionA} ou ${p.optionB} ?` : "Chaque jour, une question à deux choix.";
  const qSize = question.length > 70 ? 48 : question.length > 45 ? 58 : 68;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: "56px 64px", fontFamily: "Instrument Sans", color: C.ink }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontFamily: "Unbounded", fontWeight: 800, fontSize: 64, letterSpacing: -1.5, lineHeight: 1 }}>
            <span>Majori</span><span style={{ color: C.a }}>té</span>
          </div>
          {p.dayNum ? (
            <div style={{ display: "flex", fontFamily: "Unbounded", fontWeight: 800, fontSize: 44, color: C.muted }}>#{p.dayNum}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", marginTop: 24, background: C.surface, border: `2px solid ${C.line}`, borderRadius: 28, padding: "40px 44px" }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", color: C.muted }}>{p.caption}</div>
          <div style={{ display: "flex", fontFamily: "Unbounded", fontWeight: 600, fontSize: qSize, lineHeight: 1.2, marginTop: 14 }}>{question}</div>
          <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
            <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 18, background: C.a, color: C.onA, borderRadius: 18, padding: "18px 24px", fontSize: 30, fontWeight: 600 }}>
              <span style={{ fontFamily: "Unbounded", fontWeight: 800, fontSize: 40 }}>A</span>
              <span style={{ display: "flex", overflow: "hidden" }}>{p.optionA ?? ""}</span>
            </div>
            <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 18, background: C.b, color: C.onB, borderRadius: 18, padding: "18px 24px", fontSize: 30, fontWeight: 600 }}>
              <span style={{ fontFamily: "Unbounded", fontWeight: 800, fontSize: 40 }}>B</span>
              <span style={{ display: "flex", overflow: "hidden" }}>{p.optionB ?? ""}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 26, color: C.muted }}>
          Ne dis pas ce que tu préfères. Parie sur ce que la majorité va choisir.
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Unbounded", data: display800, weight: 800, style: "normal" },
        { name: "Unbounded", data: display600, weight: 600, style: "normal" },
        { name: "Instrument Sans", data: body, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
