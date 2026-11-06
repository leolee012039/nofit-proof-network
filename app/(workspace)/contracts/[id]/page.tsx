import { ArrowRight, Bot, Check, CircleSlash, FlaskConical, Play, RefreshCw, ShieldCheck, Store, UserRound, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/client/action-button";
import { CheckoutPanel } from "@/components/client/checkout-panel";
import { AcceptPanel, RetestForm } from "@/components/client/contract-actions";
import { CopyButton } from "@/components/client/copy-button";
import { AuditTrail } from "@/components/audit-trail";
import { ProofRunCard } from "@/components/proof-run-card";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  Disclosure,
  ExhibitTag,
  Finding,
  KeyValue,
  Mono,
  PageHeader,
  Rail,
  SealStrip,
  btn,
  cx,
  formatDate,
  type RailStep,
} from "@/components/ui";
import type { ProofContractRow, ProofRunRow } from "@/db/schema";
import { EXHIBIT, failureLabel, statusLabel } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { guard, pageActor } from "@/lib/page";
import type { VerificationCheck } from "@/lib/paypal/verify";
import { personName } from "@/lib/people";
import type { ProofBrief } from "@/lib/ai/proof-brief";
import type { ProofStepResult } from "@/lib/proofs/runner";
import type { ProofSpec } from "@/lib/proofs/types";
import { getContractDetail } from "@/lib/services/contracts";
import { describePaymentState } from "@/lib/services/payments";
import { getSystemStatus } from "@/lib/services/system";

export const metadata = { title: "Proof contract" };

const STEPS = ["Proposed", "Seller approved", "Buyer accepted", "Paid", "Proof run", "Result"];

/** Six milestones; `at` is the next milestone still to happen. */
function lifecycle(c: ProofContractRow, everPaid: boolean, runs: ProofRunRow[]): RailStep[] {
  const next: Record<string, number> = {
    DRAFT: 0,
    PROPOSED: 1,
    SELLER_APPROVED: 2,
    BUYER_ACCEPTED: 3,
    PAYMENT_PENDING: 3,
    PAYMENT_FAILED: 3,
    PAID: 4,
    PROOF_QUEUED: 4,
    RUNNING: 4,
    FAILED: 5,
    INCONCLUSIVE: 5,
    PASSED: 6,
    NEEDS_REVIEW: everPaid ? 5 : 3,
  };
  const reached = c.buyerAcceptedAt ? 3 : c.sellerApprovedAt ? 2 : 1;
  const at = c.status === "CANCELLED" ? reached : (next[c.status] ?? 0);
  const lastRun = runs.at(-1);
  return STEPS.map((label, i) => {
    let state: RailStep["state"] = i < at ? "done" : i === at ? "current" : "todo";
    let note: string | undefined;
    if (i === at && (c.status === "PAYMENT_FAILED" || c.status === "CANCELLED")) {
      state = "blocked";
      note = statusLabel(c.status);
    }
    if (i === 4 && runs.length) note = `${runs.length} of ${c.maxRuns} used`;
    if (i === 5 && c.status === "FAILED") {
      state = "blocked";
      note = lastRun?.failureClass ? failureLabel(lastRun.failureClass) : "Failed";
    }
    if (i === 5 && c.status === "PASSED") note = `on run ${lastRun?.runNumber ?? ""}`;
    return { key: label, label, state, note };
  });
}

/** Where this contract stands and who acts next: a short headline, then one plain sentence. */
function story(
  c: ProofContractRow,
  runs: ProofRunRow[],
  who: { isBuyer: boolean; isSeller: boolean },
  amount: string,
): { head: string; rest: string } {
  const last = runs.at(-1);
  const queued = runs.find((r) => r.status === "QUEUED");
  switch (c.status) {
    case "PROPOSED":
      return who.isSeller
        ? {
            head: "Review and approve this proof",
            rest: "The System Agent proposed this bounded test. Review the terms, then approve the scope and price.",
          }
        : {
            head: "Waiting for seller approval",
            rest: "Proposed by the System Agent. The seller approves the exact scope and price next.",
          };
    case "SELLER_APPROVED":
      return who.isBuyer
        ? {
            head: "Accept the approved proof",
            rest: `The seller approved this exact version. Read the terms, then accept it to unlock checkout for ${amount}.`,
          }
        : { head: "Waiting for the buyer", rest: "Approved. The buyer accepts this exact version next." };
    case "BUYER_ACCEPTED":
    case "PAYMENT_PENDING":
      return who.isBuyer
        ? {
            head: `Pay ${amount} to start the proof`,
            rest: "You accepted this exact version. The server sets the amount, never the browser.",
          }
        : { head: "Waiting for payment", rest: "Accepted. Waiting for the buyer's payment." };
    case "PAYMENT_FAILED":
      return { head: "The payment did not go through", rest: "Nothing was charged; checkout can start again." };
    case "PAID":
    case "PROOF_QUEUED":
      return who.isSeller
        ? { head: `Run ${queued?.runNumber ?? 1} is ready to execute`, rest: "Payment verified on the server. Execute it below." }
        : { head: "Paid. The proof runs next", rest: "Payment verified on the server. The seller runs the proof next." };
    case "RUNNING":
      return { head: "The proof is running", rest: "In the simulated environment, never the buyer's real systems." };
    case "FAILED":
      return {
        head: `Run ${last?.runNumber} failed${last?.failureClass ? `: ${failureLabel(last.failureClass).toLowerCase()}` : ""}`,
        rest: `The failure is kept as evidence. ${
          who.isSeller ? "Record the fix below and retest under the same contract." : "The seller can fix the environment and retest."
        }`,
      };
    case "INCONCLUSIVE":
      return { head: "The last run was inconclusive", rest: "The seller can retest under the same contract." };
    case "PASSED":
      return {
        head: `The proof passed on run ${last?.runNumber}`,
        rest: "Under the stated conditions, the integration works in the simulated environment.",
      };
    case "NEEDS_REVIEW":
      return { head: "Needs a human review", rest: "For example after a refund. No proof can start until it is resolved." };
    case "CANCELLED":
      return { head: "This contract was cancelled", rest: "Nothing can be paid or run under it." };
    default:
      return { head: statusLabel(c.status, true), rest: "" };
  }
}

/** The seal across the contract: dashed until the seller freezes the scope, struck through if cancelled. */
function ContractSeal({ c }: { c: ProofContractRow }) {
  if (c.status === "CANCELLED")
    return <SealStrip state="void" label="Void" value="Cancelled: nothing can be paid or run under this contract" />;
  if (!c.sellerApprovedAt)
    return <SealStrip state="pending" label="Unsealed" value="The scope and price seal when the seller approves them." />;
  return (
    <SealStrip
      hash={c.scopeHash}
      value={`scope and price, approved by ${personName(c.sellerApprovedBy)}`}
      meta={formatDate(c.sellerApprovedAt)}
      animate
    />
  );
}

function TimelineItem({ icon, title, children, done }: { icon: ReactNode; title: string; children: ReactNode; done: boolean }) {
  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-steel group-last:hidden" />
      <span
        className={cx(
          "relative grid size-8 shrink-0 place-items-center rounded-[2px]",
          done ? "bg-ink text-white" : "border border-dashed border-ink-3 bg-surface text-ink-3",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 pt-1 text-sm">
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-0.5 text-ink-3">{children}</div>
      </div>
    </li>
  );
}

function Terms({
  c,
  proof,
  scope,
  provider,
}: {
  c: ProofContractRow;
  proof: ProofSpec;
  scope: { paymentTerms: string; consent: string };
  provider: string;
}) {
  return (
    <div className="space-y-7 px-5 py-6 sm:px-6">
      <div>
        <h3 className="text-[14px] font-bold text-ink">What the test checks</h3>
        <p className="mt-2 max-w-[68ch] text-[16px] leading-relaxed font-semibold text-ink">{proof.hypothesis}</p>
      </div>
      <div>
        <h3 className="text-[14px] font-bold text-ink">Steps</h3>
        <ol className="mt-3 space-y-2.5">
          {proof.steps.map((s, i) => (
            <li key={s} className="flex gap-3 text-[16px] leading-relaxed text-ink-2">
              <span className="condensed grid size-6 shrink-0 place-items-center rounded-[2px] bg-mist text-[12px] font-extrabold text-ink-2 tabular">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-teal">
            <Check className="size-4" aria-hidden /> It passes if
          </h3>
          <ul className="mt-2.5 space-y-2 text-[16px] leading-relaxed text-ink-2">
            {proof.passCriteria.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-ink">
            <X className="size-4" aria-hidden /> It fails if
          </h3>
          <ul className="mt-2.5 space-y-2 text-[16px] leading-relaxed text-ink-2">
            {proof.failCriteria.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <FlaskConical className="size-4 text-amber" aria-hidden /> What this proof does not show
        </h3>
        <ul className="mt-2.5 max-w-[70ch] space-y-2 text-[16px] leading-relaxed text-ink-2">
          {proof.limitations.map((s) => (
            <li key={s} className="flex gap-2.5">
              <CircleSlash className="mt-[5px] size-3.5 shrink-0 text-ink-3" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <KeyValue
          items={[
            ["You receive", proof.deliverables.join(" · ")],
            ["Evidence valid for", `${proof.evidenceTtlDays} days`],
            ["Payment terms", scope.paymentTerms],
            ["Provider in this demo", provider],
            ["Consent", scope.consent],
            [
              "Starting environment",
              <Mono key="env">
                HubSpot {proof.initialEnvironment.hubspot.apiVersion} · scopes{" "}
                {proof.initialEnvironment.hubspot.grantedScopes.join(", ") || "none"} · approval gate{" "}
                {proof.initialEnvironment.approvalWorkflow.enabled ? "on" : "off"}
              </Mono>,
            ],
            [
              "Scope fingerprint (SHA-256)",
              <span key="h" className="flex flex-wrap items-center gap-1">
                <Mono className="text-ink">{c.scopeHash}</Mono>
                <CopyButton value={c.scopeHash} />
              </span>,
            ],
          ]}
        />
        <p className="mt-3 text-[14px] text-ink-3">
          The fingerprint freezes these terms at seller approval. The buyer accepts exactly this fingerprint, and the database refuses any
          later change.
        </p>
      </div>
    </div>
  );
}

const STEP_RESULT: Record<string, { label: string; tone: "teal" | "red" | "neutral" }> = {
  PASS: { label: "Passed", tone: "teal" },
  FAIL: { label: "Failed", tone: "red" },
  SKIPPED: { label: "Not reached", tone: "neutral" },
};

/**
 * The questions this proof answers for this buyer, each pinned to a check the runner
 * performs; once a run has finished, each question shows that check's own result.
 */
function ProofBriefSection({ brief, runs }: { brief: ProofBrief; runs: ProofRunRow[] }) {
  const done = [...runs].reverse().find((r) => ["PASSED", "FAILED", "INCONCLUSIVE"].includes(r.status));
  const steps = (done?.stepsJson ?? []) as ProofStepResult[];
  return (
    <Card>
      <CardHeader title="What this test answers" meta={brief.draftedBy.label} />
      <div className="space-y-5 px-5 py-5">
        <p className="max-w-[68ch] text-[16px] leading-relaxed text-ink">{brief.summary}</p>
        <ul className="divide-y divide-steel border-y border-steel">
          {brief.answers.map((a) => {
            const step = steps.find((s) => s.id === a.check);
            const result = step ? STEP_RESULT[step.status] : null;
            return (
              <li key={a.check} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                <p className="text-[16px] font-semibold text-ink">{a.question}</p>
                <p className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge mono title="The simulator check that answers this question">
                    {a.check} · {a.checkName}
                  </Badge>
                  {result && done ? (
                    <Badge tone={result.tone}>
                      {result.label} in run {done.runNumber}
                    </Badge>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
        {brief.notCovered.length ? (
          <div>
            <p className="text-[14px] font-bold text-ink">Not covered by this test</p>
            <ul className="mt-1.5 space-y-1 text-[14px] leading-relaxed text-ink-2">
              {brief.notCovered.map((s) => (
                <li key={s} className="flex gap-2.5">
                  <CircleSlash className="mt-[4px] size-3.5 shrink-0 text-ink-3" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default async function ContractPage(props: PageProps<"/contracts/[id]">) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const actor = await pageActor();
  const res = await guard(() => getContractDetail(actor, id));
  if (!res.ok)
    return (
      <Callout tone="red" title="Access denied">
        {res.message}
      </Callout>
    );
  const d = res.value;
  const c = d.contract;
  const scope = c.immutableScopeJson as {
    contractTitle: string;
    proof: ProofSpec;
    proofBrief?: ProofBrief;
    paymentTerms: string;
    consent: string;
    demoNotice: string;
    requestTitle: string;
  };
  const proof = scope.proof;
  const amount = formatMoney(c.priceMinor, c.currency);
  const status = getSystemStatus();
  const isBuyer = actor.role === "buyer" && actor.orgId === c.buyerOrganizationId;
  const isSeller = actor.role === "seller_admin" && actor.orgId === c.sellerOrganizationId;
  const captured = d.orders.find((o) => o.paymentState === "CAPTURED");
  const canPay = isBuyer && ["BUYER_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(c.status) && !captured;
  const lastRun = d.runs.at(-1);
  const lastEnv = lastRun?.environmentJson as { hubspot: { grantedScopes: string[] }; approvalWorkflow: { enabled: boolean } } | undefined;
  const everPaid = Boolean(captured) || d.orders.some((o) => ["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED"].includes(o.paymentState));
  const reviewing = ["PROPOSED", "SELLER_APPROVED"].includes(c.status);
  const providerName = status.payment.kind === "sandbox" ? "PayPal Sandbox" : "the simulated provider";
  const now = story(c, d.runs, { isBuyer, isSeller }, amount);

  return (
    <>
      <PageHeader
        size="record"
        meta={`${d.buyerName} ↔ ${d.sellerName} · ${amount} fixed · up to ${c.maxRuns} runs`}
        title={scope.contractTitle}
      >
        A bounded test for the request{" "}
        <Link href={`/requests/${c.requestId}`} className="font-semibold text-ink underline">
          {scope.requestTitle}
        </Link>
        .
      </PageHeader>

      {search.checkout === "cancelled" ? (
        <div className="mb-6">
          <Callout title="Checkout cancelled">Nothing was charged. You can start checkout again.</Callout>
        </div>
      ) : null}

      <section
        aria-label="Where this contract stands"
        className="mb-10 overflow-hidden rounded-[4px] border border-steel bg-surface shadow-[0_1px_2px_rgba(13,16,20,0.05)]"
      >
        <div className="grid gap-5 px-5 pt-6 pb-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <ExhibitTag n={EXHIBIT.contract} size="lg" label="Proof contract" className="mt-1" />
            <div className="min-w-0">
              <h2 className="font-display text-[32px] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-ink sm:text-[40px]">
                {now.head}
              </h2>
              {now.rest ? <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-ink-2">{now.rest}</p> : null}
            </div>
          </div>
          <Finding status={c.status} contract size="lg" className="justify-self-start md:mt-1 md:justify-self-end" />
        </div>
        <ContractSeal c={c} />
        <div className="px-5 py-5 sm:px-8">
          <Rail steps={lifecycle(c, everPaid, d.runs)} label="Contract lifecycle" />
        </div>

        {isSeller && c.status === "PROPOSED" ? (
          <div className="flex flex-wrap items-center gap-4 border-t border-steel bg-paper/60 px-5 py-5 sm:px-8">
            <ActionButton url={`/api/proof-contracts/${c.id}/approve`} body={{ scopeHash: c.scopeHash }} testId="approve-contract">
              Approve scope and {amount} price
            </ActionButton>
            <p className="text-[14px] text-ink-3">Approving seals the terms below. Only people approve, accept and pay.</p>
          </div>
        ) : null}
        {isBuyer && c.status === "SELLER_APPROVED" ? (
          <div className="border-t border-steel bg-paper/60 px-5 py-5 sm:px-8">
            <AcceptPanel contractId={c.id} scopeHash={c.scopeHash} amountLabel={amount} />
          </div>
        ) : null}
        {canPay ? (
          <div className="grid gap-6 border-t-2 border-dashed border-steel-2 bg-paper/60 px-5 py-6 sm:px-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10">
            <div>
              <p className="font-display text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular">{amount}</p>
              <p className="mt-2 text-[14px] text-ink-3">Fixed by the contract. The server sets the amount, never the browser.</p>
            </div>
            <CheckoutPanel
              contractId={c.id}
              mode={status.payment.kind}
              clientId={status.payment.kind === "sandbox" ? status.payment.clientId : undefined}
              amountLabel={amount}
            />
          </div>
        ) : null}
        {c.status === "PASSED" ? (
          <div className="flex flex-wrap items-center gap-4 border-t border-teal-line bg-teal-bg px-5 py-5 sm:px-8">
            <Link href={`/replay?requestId=${c.requestId}`} className={btn.marker}>
              See how this changed the decision <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="text-[14px] text-ink-2">The passing outcome is now evidence for the next assessment like this one.</p>
          </div>
        ) : null}
      </section>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          {scope.proofBrief ? <ProofBriefSection brief={scope.proofBrief} runs={d.runs} /> : null}
          {d.runs.length ? (
            <section className="space-y-5" aria-labelledby="proof-execution">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="proof-execution" className="font-display text-[22px] font-bold tracking-[-0.015em]">
                  Proof runs
                </h2>
                <p className="text-sm text-ink-3">
                  {d.runs.length} of {c.maxRuns} used · deterministic simulator, never the buyer&apos;s real systems
                </p>
              </div>
              {d.runs.map((r) => (
                <ProofRunCard
                  key={r.id}
                  run={r}
                  action={
                    isSeller && r.status === "QUEUED" && c.status === "PROOF_QUEUED" ? (
                      <ActionButton url={`/api/proof-runs/${r.id}/execute`} testId={`execute-run-${r.runNumber}`}>
                        <Play className="size-4" aria-hidden /> Execute run {r.runNumber}
                      </ActionButton>
                    ) : null
                  }
                />
              ))}
              {isSeller && (c.status === "FAILED" || c.status === "INCONCLUSIVE") && d.runs.length < c.maxRuns ? (
                <Card>
                  <CardHeader
                    title="Fix the environment and retest"
                    meta={`Run ${d.runs.length + 1} of at most ${c.maxRuns}, same contract, no new payment`}
                  />
                  <div className="px-5 py-5">
                    <RetestForm
                      contractId={c.id}
                      hasWrite={lastEnv?.hubspot.grantedScopes.includes("contacts.write") ?? false}
                      hasApproval={lastEnv?.approvalWorkflow.enabled ?? false}
                    />
                  </div>
                </Card>
              ) : null}
              {d.outcomes.length ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
                  Recorded in outcome memory:
                  {d.outcomes.map((o) => (
                    <Link key={o.id} href={`/outcomes/${o.id}`} className="font-semibold text-ink underline">
                      {statusLabel(o.result)}
                      {o.failureClass ? ` (${failureLabel(o.failureClass).toLowerCase()})` : ""}
                    </Link>
                  ))}
                </p>
              ) : null}
            </section>
          ) : captured ? null : (
            <div className="flex gap-4 rounded-[4px] border border-dashed border-ink-3/60 px-5 py-5">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
              <div>
                <p className="font-semibold text-ink">Proof runs unlock after a verified payment</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-3">
                  There is no “mark as paid” shortcut: the database refuses a run without a payment the server has captured and verified.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Disclosure
              open={reviewing}
              title="Contract terms"
              meta={c.sellerApprovedAt ? "Sealed at seller approval" : "Sealed when the seller approves"}
            >
              <Terms
                c={c}
                proof={proof}
                scope={scope}
                provider={
                  status.payment.kind === "sandbox" ? "PayPal Sandbox" : "Simulated provider (PayPal Sandbox is not configured here)"
                }
              />
            </Disclosure>
            <AuditTrail events={d.events} />
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          {d.orders.length ? (
            <section aria-labelledby="payment-heading" className="space-y-4">
              <h2 id="payment-heading" className="text-[16px] font-bold text-ink">
                Payment
              </h2>
              {d.orders.map((o) => {
                const checks = ((o.verificationJson as { checks?: VerificationCheck[] } | null)?.checks ?? []) as VerificationCheck[];
                const confirmed = d.webhooks.some((w) => w.paypalOrderRowId === o.id && w.eventType === "PAYMENT.CAPTURE.COMPLETED");
                const live = ![
                  "CAPTURED",
                  "REFUNDED",
                  "PARTIALLY_REFUNDED",
                  "REVERSED",
                  "DENIED",
                  "VERIFICATION_FAILED",
                  "VOIDED",
                ].includes(o.paymentState);
                const passed = checks.filter((x) => x.ok).length;
                return (
                  <div
                    key={o.id}
                    className={cx(
                      "overflow-hidden rounded-[4px] border border-steel bg-surface shadow-[0_1px_2px_rgba(13,16,20,0.05)]",
                      o.paymentState === "VOIDED" && "opacity-70",
                    )}
                  >
                    <div className="px-5 pt-5 pb-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <ExhibitTag n={EXHIBIT.payment} size="sm" label="Payment" />
                          <p className="font-display text-[22px] leading-none font-extrabold tabular">
                            {formatMoney(o.amountMinor, o.currency)}
                          </p>
                        </div>
                        <Badge tone={o.providerMode === "sandbox" ? "teal" : "amber"}>
                          {o.providerMode === "sandbox" ? "PayPal Sandbox" : "Simulated — not PayPal"}
                        </Badge>
                      </div>
                      <p
                        className={cx(
                          "mt-4 flex items-center gap-1.5 text-[16px] font-bold",
                          o.paymentState === "CAPTURED" ? "text-teal" : o.paymentState === "VOIDED" ? "text-ink-3" : "text-ink",
                        )}
                      >
                        {o.paymentState === "CAPTURED" ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
                        {statusLabel(o.paymentState)}
                      </p>
                      {checks.length ? (
                        <p className="mt-0.5 text-[14px] text-ink-3">
                          {passed} of {checks.length} server checks passed
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{describePaymentState(o, confirmed)}</p>
                      <div className="mt-4">
                        <KeyValue
                          items={[
                            ...(o.payeeMerchantId
                              ? [
                                  [
                                    "Paid to",
                                    <span key="p">
                                      {d.sellerName} · <Mono>{o.payeeMerchantId}</Mono>
                                    </span>,
                                  ] as [ReactNode, ReactNode],
                                ]
                              : []),
                            ["Order", <Mono key="o">{o.paypalOrderId}</Mono>],
                            ["Capture", o.captureId ? <Mono key="c">{o.captureId}</Mono> : "—"],
                          ]}
                        />
                      </div>
                      {checks.length ? (
                        <details className="mt-4">
                          <summary className="cursor-pointer text-[14px] text-ink-3 hover:text-ink">See every server check</summary>
                          <ul className="mt-2 space-y-1.5 text-[14px]">
                            {checks.map((ch) => (
                              <li key={ch.name} className={cx("flex gap-1.5", ch.ok ? "text-ink-2" : "text-red")}>
                                {ch.ok ? (
                                  <Check className="mt-0.5 size-3.5 shrink-0 text-teal" aria-label="passed" />
                                ) : (
                                  <X className="mt-0.5 size-3.5 shrink-0" aria-label="failed" />
                                )}
                                <span className="min-w-0 break-all">
                                  {ch.name}: <span className="font-mono text-[12px]">{ch.actual}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {(isBuyer || isSeller) && live ? (
                        <div className="mt-4">
                          <ActionButton url={`/api/paypal/orders/${encodeURIComponent(o.paypalOrderId)}/reconcile`} variant="secondary">
                            <RefreshCw className="size-4" aria-hidden /> Check status with{" "}
                            {o.providerMode === "sandbox" ? "PayPal" : "the provider"}
                          </ActionButton>
                        </div>
                      ) : null}
                    </div>
                    {o.paymentState === "CAPTURED" ? (
                      <SealStrip
                        label="Verified"
                        value={o.providerMode === "sandbox" ? "capture verified with PayPal" : "capture verified (simulated)"}
                      />
                    ) : null}
                  </div>
                );
              })}
              <p className="text-[14px] leading-relaxed text-ink-3">
                Payment proves the test was paid for through {providerName}. It is never evidence of technical success, and it is not
                escrow.
              </p>
            </section>
          ) : null}

          <Card>
            <CardHeader title="Who approved what" meta="Only people approve, accept and pay" />
            <div className="space-y-5 px-5 py-5">
              <ol>
                <TimelineItem icon={<Bot className="size-4" aria-hidden />} title="Proposed by the System Agent" done>
                  It cannot approve, accept or change prices.
                </TimelineItem>
                <TimelineItem icon={<Store className="size-4" aria-hidden />} title="Seller approval" done={Boolean(c.sellerApprovedAt)}>
                  {c.sellerApprovedAt ? `${personName(c.sellerApprovedBy)} · ${formatDate(c.sellerApprovedAt)}` : "Waiting for the seller."}
                </TimelineItem>
                <TimelineItem
                  icon={<UserRound className="size-4" aria-hidden />}
                  title="Buyer acceptance"
                  done={Boolean(c.buyerAcceptedAt)}
                >
                  {c.buyerAcceptedAt ? `${personName(c.buyerAcceptedBy)} · ${formatDate(c.buyerAcceptedAt)}` : "Waiting for the buyer."}
                </TimelineItem>
              </ol>
              {!isBuyer && !isSeller ? <p className="text-sm text-ink-3">Read-only view.</p> : null}
              {(isBuyer || isSeller) && ["PROPOSED", "SELLER_APPROVED", "BUYER_ACCEPTED", "PAYMENT_FAILED"].includes(c.status) ? (
                <ActionButton
                  url={`/api/proof-contracts/${c.id}/cancel`}
                  body={{ reason: "Cancelled from the contract page" }}
                  variant="danger"
                  confirm="Cancel this proof contract?"
                >
                  Cancel contract
                </ActionButton>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
