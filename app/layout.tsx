import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono, Unbounded } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Fonts are self-hosted by next/font (no request to Google at runtime).
const unbounded = Unbounded({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-unbounded", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-instrument", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-jetbrains", display: "swap" });

const siteUrl = process.env.SITE_URL;
if (!siteUrl) throw new Error("Missing environment variable SITE_URL (see .env.example).");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Majorité",
  description: "Chaque jour, une question à deux choix. Ne dis pas ce que tu préfères : parie sur ce que la majorité va choisir.",
  applicationName: "Majorité",
  appleWebApp: { capable: true, title: "Majorité", statusBarStyle: "default" },
  openGraph: { type: "website", siteName: "Majorité", locale: "fr_FR" },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EAF0EF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1413" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const clarityId = process.env.CLARITY_PROJECT_ID?.trim();
  return (
    <html lang="fr" className={`${unbounded.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        {clarityId && /^[a-z0-9]+$/i.test(clarityId) ? (
          // Microsoft Clarity, loaded once the browser is idle so it never delays the game.
          <Script id="clarity" strategy="lazyOnload">
            {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`}
          </Script>
        ) : null}
      </body>
    </html>
  );
}
