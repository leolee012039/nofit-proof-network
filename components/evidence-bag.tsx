import { EXHIBIT, runExhibit } from "@/lib/display";
import { ExhibitTag, Finding, SealStrip, cx } from "./ui";

/**
 * Landing-page hero artifact: the fictional demo storyline as the thing NoFit
 * actually produces, a sealed evidence bag with its exhibits listed on the
 * custody label. The digests are the real, deterministic outputs of the
 * simulator (`npm run proof:replay`).
 */
const EXHIBITS: Array<{ n: string; what: string; entry: string; tone?: "teal" | "red"; mono?: boolean }> = [
  { n: EXHIBIT.request, what: "Request", entry: "LINE → HubSpot → Sheets sync" },
  { n: EXHIBIT.verdict, what: "Verdict", entry: "Not a fit: contacts.write missing", tone: "red" },
  { n: EXHIBIT.contract, what: "Proof contract", entry: "$49.00 · scope sealed" },
  { n: EXHIBIT.payment, what: "Payment", entry: "PayPal Sandbox · capture verified", tone: "teal" },
  { n: runExhibit(1), what: "Run 1 · failed", entry: "188be754…683c", tone: "red", mono: true },
  { n: runExhibit(2), what: "Run 2 · passed", entry: "d25799c4…fb2b", tone: "teal", mono: true },
];

export function EvidenceBag() {
  return (
    <figure className="relative mx-auto w-full max-w-[440px]" aria-label="Example evidence bag from the fictional demo storyline">
      <div className="overflow-hidden rounded-[4px] border border-steel-2 bg-surface shadow-[0_2px_4px_rgba(13,16,20,0.06),0_24px_48px_-24px_rgba(13,16,20,0.28)]">
        <div className="flex items-baseline justify-between gap-4 bg-ink px-5 py-3 text-white">
          <span className="condensed text-[22px] leading-none font-extrabold tracking-[0.1em] uppercase">Evidence</span>
          <span className="text-[12px] text-white/70">Fictional demo case</span>
        </div>
        <SealStrip value="Brightline Logistics → Lumen Automation Studio" animate />
        <dl className="divide-y divide-steel px-5">
          {EXHIBITS.map((x) => (
            <div key={x.n} className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)] items-center gap-3 py-2.5">
              <dt className="flex min-w-0 items-center gap-3 text-[14px] text-ink-3">
                <ExhibitTag n={x.n} size="sm" label={x.what} />
                <span className="truncate">{x.what}</span>
              </dt>
              <dd
                className={cx(
                  "min-w-0 truncate text-right text-[14px] font-semibold",
                  x.mono && "font-mono text-[12px] font-medium",
                  x.tone === "teal" ? "text-teal" : x.tone === "red" ? "text-red" : "text-ink",
                )}
              >
                {x.entry}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-4 border-t-2 border-dashed border-steel-2 bg-paper/60 px-5 py-4">
          <p className="text-[14px] leading-snug text-ink-2">
            The next similar request
            <br />
            <span className="font-semibold text-ink">cites exhibit {runExhibit(2)}</span>
          </p>
          <Finding status="CONDITIONAL_FIT" label="Conditional fit" size="md" className="settle" />
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[12px] text-ink-3">
        Digests are real simulator output. Reproduce with <code className="font-mono">npm run proof:replay</code>.
      </figcaption>
    </figure>
  );
}
