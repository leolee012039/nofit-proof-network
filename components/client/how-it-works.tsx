"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { btn, cx } from "@/components/ui";

/** Each sample row: label, value, and "code" when the value is an identifier set in mono. */
const STEPS: Array<{ title: string; body: string; sample: Array<[string, string, "code"?]> }> = [
  {
    title: "Buyer describes the integration",
    body: "Goal, budget, tools, granted permissions, timeline and compliance limits. Nothing unstated is assumed: an unknown permission stays unknown.",
    sample: [
      ["Tools", "LINE → HubSpot → Google Sheets"],
      ["Granted", "contacts.read", "code"],
      ["Wants", "Fully automatic updates"],
    ],
  },
  {
    title: "Deterministic policy decides; AI explains",
    body: "Rules check the request against the seller's versioned knowledge before any model runs. The model can explain and ask questions, but cannot overrule a blocker.",
    sample: [
      ["Verdict", "Not a fit for the requested scope"],
      ["Blocker", "R-CRM-WRITE-SCOPE", "code"],
      ["Needs review", "R-HUMAN-APPROVAL-CONFLICT", "code"],
    ],
  },
  {
    title: "A smaller, purchasable proof contract",
    body: "Instead of a $3,000 leap of faith, the seller offers a fixed-price, bounded test of the remediated configuration. The seller approves the exact scope; the buyer accepts that exact version.",
    sample: [
      ["Contract", "$49.00 proof (demo price)"],
      ["Sealed", "Scope SHA-256 frozen at seller approval"],
      ["Accepted", "The buyer accepts the same hash"],
    ],
  },
  {
    title: "PayPal Sandbox checkout",
    body: "Server-side Orders v2: create, buyer approval, capture, then amount, currency and reference verification. Signature-verified webhooks, deduplicated. Only a verified capture unlocks the proof.",
    sample: [
      ["Order", "Intent CAPTURE, amount from the contract"],
      ["Capture", "Completed and verified server-side"],
      ["Unlocks", "Proof run 1, queued exactly once"],
    ],
  },
  {
    title: "A bounded test produces hashed evidence",
    body: "A deterministic simulator runs the test case and records steps, logs and a SHA-256 digest. Failures are kept: a missing permission is not a product defect.",
    sample: [
      ["Run 1", "Failed: permission denied"],
      ["Change", "Environment change recorded"],
      ["Run 2", "Passed under the stated conditions"],
    ],
  },
  {
    title: "Evidence improves the next decision",
    body: "The next similar request retrieves the outcome records and becomes CONDITIONAL_FIT, citing the exact run IDs. Decision Replay shows what changed and why.",
    sample: [
      ["Decision", "Not a fit → Conditional fit"],
      ["Reason", "REMEDIATION_VERIFIED_BY_OUTCOME", "code"],
      ["Cites", "The passing outcome record"],
    ],
  },
];

export function HowItWorks() {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-12">
      <ol className="relative" aria-label="Storyline steps">
        <span aria-hidden className="absolute top-4 bottom-4 left-[19px] w-px bg-steel-2" />
        {STEPS.map((step, idx) => {
          const state = idx < i ? "done" : idx === i ? "current" : "todo";
          return (
            <li key={step.title} className="relative">
              <button
                type="button"
                onClick={() => setI(idx)}
                aria-current={idx === i ? "step" : undefined}
                className={cx(
                  "group flex w-full items-center gap-4 rounded-[3px] py-2.5 pr-3 text-left transition-colors duration-150",
                  idx === i ? "text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                <span
                  className={cx(
                    "condensed relative z-[1] grid h-7 w-10 shrink-0 place-items-center text-[14px] font-extrabold tabular transition-colors duration-150",
                    state === "current" && "tent bg-marker text-ink",
                    state === "done" && "rounded-[2px] bg-ink text-white",
                    state === "todo" && "rounded-[2px] border border-dashed border-ink-3 bg-paper text-ink-3 group-hover:border-ink",
                  )}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className={cx("text-[16px] leading-snug", idx === i && "font-bold")}>
                  {step.title}
                  {state === "done" ? <span className="sr-only"> (completed)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div>
        <div className="rounded-[4px] border border-steel bg-surface px-6 pt-8 pb-9 shadow-[0_1px_2px_rgba(13,16,20,0.05)] sm:px-10">
          {/* Only the step text is announced when it changes, not the navigation buttons. */}
          <div aria-live="polite" aria-atomic="true">
            <h3 className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em]">{s.title}</h3>
            <p className="mt-1 text-[14px] text-ink-3">
              Step {i + 1} of {STEPS.length}
            </p>
            <p className="mt-3 max-w-[60ch] leading-relaxed text-ink-2">{s.body}</p>
          </div>
          <dl className="mt-6 divide-y divide-steel border-y border-steel">
            {s.sample.map(([label, value, kind]) => (
              <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-4 py-2.5">
                <dt className="condensed text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</dt>
                <dd className={cx("min-w-0 break-words text-[14px] text-ink", kind === "code" && "font-mono text-[12px]")}>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 flex gap-2">
            <button type="button" className={btn.secondary} disabled={i === 0} onClick={() => setI(i - 1)}>
              <ArrowLeft className="size-4" aria-hidden /> Previous
            </button>
            <button type="button" className={btn.primary} disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}>
              Next step <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
