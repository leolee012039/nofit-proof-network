import { ArrowRight, Check, FlaskConical, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { HowItWorks } from "@/components/client/how-it-works";
import { EvidenceBag } from "@/components/evidence-bag";
import { btn, cx } from "@/components/ui";

type Kind = "real" | "simulated" | "configurable";

const REAL_VS_SIMULATED: Array<[string, string, Kind]> = [
  [
    "PayPal Orders v2: create, approve, capture, verify",
    "Real PayPal Sandbox API when credentials are configured; a clearly labelled FIXTURE provider otherwise.",
    "real",
  ],
  ["Webhook signature verification and idempotent ledger", "Real (PayPal verify-webhook-signature postback). Needs a public URL.", "real"],
  ["Deterministic fit policy with citations", "Real and fully tested.", "real"],
  [
    "AI: intake draft and explanation",
    "Live Claude drafts the intake from the buyer's own words, quoting them, and explains the decision. A labelled offline fallback runs without a key.",
    "configurable",
  ],
  [
    "HubSpot, LINE and Google Sheets testing",
    "Simulated only: a deterministic proof runner. No real account is ever accessed.",
    "simulated",
  ],
  ["Customers, prices and outcomes", "Fictional demo data. No traction or revenue is claimed.", "simulated"],
];

const KIND: Record<Kind, { label: string; icon: typeof Check; cls: string }> = {
  real: { label: "Real", icon: Check, cls: "bg-teal-bg text-teal" },
  simulated: { label: "Simulated", icon: FlaskConical, cls: "bg-amber-bg text-amber" },
  configurable: { label: "Configurable", icon: SlidersHorizontal, cls: "bg-white text-ink" },
};

const PRINCIPLES = [
  {
    title: "The problem",
    body: "Small businesses buying automation, and the agencies selling it, sign $3,000 projects before anyone has checked permissions, versions or approval rules. Sellers either over-promise or lose the deal.",
  },
  {
    title: "The move",
    body: "Detect the constraint, carve out the smallest purchasable proof, take a real payment for it, run a bounded test, keep the evidence, failures included.",
  },
  {
    title: "What a pass means",
    body: "Payment proves the test was paid for, never that it passed. A pass holds only for the tested versions and conditions, and every record says which.",
  },
];

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-[2px]">
      <span aria-hidden className="tent condensed grid h-7 min-w-11 place-items-center bg-marker px-3 text-[14px] font-extrabold text-ink">
        NF
      </span>
      <span className="leading-none">
        <span className="block text-[22px] font-extrabold tracking-[-0.02em]">NoFit</span>
        <span className="mt-0.5 block text-[12px] text-ink-3">Proof Network</span>
      </span>
    </Link>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Wordmark />
        <nav aria-label="Page" className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="hidden rounded-[3px] px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink sm:inline-block">
            How it works
          </a>
          <a href="#honesty" className="hidden rounded-[3px] px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink sm:inline-block">
            Real vs simulated
          </a>
          <Link href="/login" className={btn.primary}>
            Open the demo <ArrowRight className="size-4" aria-hidden />
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pt-16 lg:pb-28">
          <div>
            <h1 className="font-display text-[52px] leading-[0.98] font-extrabold tracking-[-0.035em] text-balance sm:text-[76px]">
              Don&apos;t buy promises.
              <span className="mt-2 block">
                <span className="bg-marker box-decoration-clone px-2">Buy proof.</span>
              </span>
            </h1>
            <p className="mt-8 max-w-[32rem] text-[22px] leading-snug font-semibold text-ink">
              NoFit turns a $3,000 leap of faith into a $49 bounded technical proof.
            </p>
            <p className="mt-3 max-w-[34rem] text-[16px] leading-relaxed text-ink-2">
              For agencies selling automation and the businesses buying it. Claude reads the request in plain English, a policy engine finds
              what blocks it, and the buyer pays a fixed price through PayPal for a bounded test. The evidence, failures included, changes
              the next decision.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className={cx(btn.marker, "px-5 py-3 text-[16px]")}>
                Try the buyer → seller flow <ArrowRight className="size-4" aria-hidden />
              </Link>
              <a href="#how" className={cx(btn.secondary, "px-5 py-3 text-[16px]")}>
                See how it works
              </a>
            </div>
            <p className="mt-8 text-[14px] text-ink-3">Hackathon prototype · fictional companies and prices · PayPal Sandbox test money</p>
          </div>
          <EvidenceBag />
        </section>

        <section className="border-y border-steel bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="border-t-[3px] border-ink pt-5">
                <h2 className="font-display text-[22px] font-bold tracking-[-0.01em]">{p.title}</h2>
                <p className="mt-3 leading-relaxed text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.025em] text-balance">
              From a blocked project to a purchasable proof
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
              The fictional demo storyline, step by step. Every step runs as real code in the app.
            </p>
          </div>
          <div className="mt-10">
            <HowItWorks />
          </div>
        </section>

        <section id="honesty" className="scroll-mt-8 bg-ink text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.025em]">
                What is real, what is simulated
              </h2>
              <p className="mt-3 text-[16px] leading-relaxed text-white/75">
                A proof product has to be honest about its own evidence. Here is exactly what this prototype does and does not do.
              </p>
            </div>
            <ul className="mt-10 divide-y divide-white/15 border-y border-white/15">
              {REAL_VS_SIMULATED.map(([component, status, kind]) => {
                const k = KIND[kind];
                const Icon = k.icon;
                return (
                  <li key={component} className="grid gap-2 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-8">
                    <span className="flex items-start gap-3">
                      <span
                        className={cx(
                          "condensed mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[12px] font-bold tracking-[0.04em] uppercase",
                          k.cls,
                        )}
                      >
                        <Icon className="size-3" aria-hidden />
                        {k.label}
                      </span>
                      <span className="font-semibold text-white">{component}</span>
                    </span>
                    <span className="text-white/75 sm:pt-0.5">{status}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="mx-auto max-w-2xl font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.025em] text-balance">
            Walk the whole storyline in two minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">
            Sign in as a fictional buyer, seller or read-only reviewer. No account, no password, no real money.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/login" className={cx(btn.marker, "px-5 py-3 text-[16px]")}>
              Open the demo <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-steel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[14px] text-ink-3 sm:px-6">
          <span>Built for the PayPal AI Hackathon 2026 by TriloAi LLC.</span>
          <span>All data is fictional. MIT licensed.</span>
        </div>
      </footer>
    </div>
  );
}
