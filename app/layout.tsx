import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "NoFit Proof Network", template: "%s · NoFit Proof Network" },
  description:
    "Don't buy promises. Buy proof. Paid, bounded technical feasibility proofs with PayPal Sandbox checkout and AI fit assessment (hackathon prototype, fictional data).",
};

/** The visual direction this build is held to; it ships in the markup so the finish review can audit against it. */
const DIRECTION_CONTRACT = `<!--
THESIS: Every NoFit record is handled as court evidence: request, verdict, contract, payment and runs are numbered exhibits, sealed by their hashes and signed through a chain of custody. Refuses the card-grid SaaS dashboard and the paper-and-stamp editorial look.
OWN-WORLD: bench gray #eef0ef ground, white form sheets with 4px corners and ruled form cells, ink #0d1014, yellow A-frame exhibit markers #ffc40c with condensed black numerals, ink seal strips carrying mono hashes, solid finding tags with a punched hole; Archivo (width axis) plus JetBrains Mono for hashes only.
STORY: a judge reads the verdict, sees the $49 proof that would settle it, watches run 05 fail and run 06 pass, and replays Not a fit into Conditional fit.
FIRST VIEWPORT: request page: the request named in a quiet 22px title; EX 02 marker beside the 40px verdict headline (the only display type), finding tag at right, a "Blocked by" form row, then the seal strip with the input hash, which closes exhibit 02 and divides it from exhibit 03 (moved below "Blocked by" so the seal reads as the end of the record): the $49 proof with a yellow "Review the proof" action.
FORM: candidate 4 of 7, evidence custody; seed c0fd5a21.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen antialiased">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
