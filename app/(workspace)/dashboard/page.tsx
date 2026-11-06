import { ArrowRight, CheckCircle2, Inbox } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, Empty, PageHeader, Rail, StatusBadge, btn, cx, formatDay, type RailStep } from "@/components/ui";
import { pageActor } from "@/lib/page";
import { listContracts } from "@/lib/services/contracts";
import { listOutcomes } from "@/lib/services/outcomes";
import { listRequests } from "@/lib/services/requests";

export const metadata = { title: "Overview" };

type Contracts = Awaited<ReturnType<typeof listContracts>>;
type Requests = Awaited<ReturnType<typeof listRequests>>;
type Outcomes = Awaited<ReturnType<typeof listOutcomes>>;

function nextActions(role: string, contracts: Contracts) {
  const items: Array<{ href: string; label: string }> = [];
  for (const { contract: c } of contracts) {
    const href = `/contracts/${c.id}`;
    if (role === "seller_admin") {
      if (c.status === "PROPOSED") items.push({ href, label: "Review and approve the proposed $49 proof" });
      if (c.status === "PROOF_QUEUED") items.push({ href, label: "Payment verified: execute the queued proof run" });
      if (c.status === "FAILED") items.push({ href, label: "The proof failed: record the fix and retest" });
    }
    if (role === "buyer") {
      if (c.status === "SELLER_APPROVED") items.push({ href, label: "Accept the seller-approved proof contract" });
      if (c.status === "BUYER_ACCEPTED" || c.status === "PAYMENT_PENDING" || c.status === "PAYMENT_FAILED")
        items.push({ href, label: "Pay for the proof" });
    }
  }
  return items;
}

const PAID_OR_LATER = new Set(["PAID", "PROOF_QUEUED", "RUNNING", "PASSED", "FAILED", "INCONCLUSIVE"]);

/** Storyline progress computed from this tenant's real records (a checklist, not a metric); each step links to its record. */
function storyline(requests: Requests, contracts: Contracts, outcomes: Outcomes): RailStep[] {
  const first = requests.at(-1);
  const approved = contracts.find((c) => c.contract.sellerApprovedAt);
  const paid = contracts.find((c) => PAID_OR_LATER.has(c.contract.status) || c.latestOrder?.paymentState === "CAPTURED");
  const fail = outcomes.find((o) => o.outcome.result === "FAIL");
  const pass = outcomes.find((o) => o.outcome.result === "PASS");
  const changed = requests.some((r) => r.latestAssessment?.fitStatus === "CONDITIONAL_FIT");
  const steps: Array<[string, boolean, string | undefined]> = [
    ["Request assessed", Boolean(first), first && `/requests/${first.request.id}`],
    ["Proof approved", Boolean(approved), approved && `/contracts/${approved.contract.id}`],
    ["Proof paid", Boolean(paid), paid && `/contracts/${paid.contract.id}`],
    ["Run 1 failed", Boolean(fail), fail && `/outcomes/${fail.outcome.id}`],
    ["Retest passed", Boolean(pass), pass && `/outcomes/${pass.outcome.id}`],
    ["Decision changed", changed, changed && first ? `/replay?requestId=${first.request.id}` : undefined],
  ];
  const firstOpen = steps.findIndex(([, done]) => !done);
  return steps.map(([label, done, href], i) => ({
    key: label,
    label,
    href,
    state: done ? "done" : i === firstOpen ? "current" : "todo",
  }));
}

export default async function Dashboard() {
  const actor = await pageActor();
  const [requests, contracts, outcomes] = await Promise.all([listRequests(actor), listContracts(actor), listOutcomes(actor)]);
  const actions = nextActions(actor.role, contracts);
  const steps = storyline(requests, contracts, outcomes);
  const completed = steps.filter((s) => s.state === "done").length;
  const allDone = completed === steps.length;
  const current = steps.find((s) => s.state === "current");
  const counterpart = actor.orgRole === "buyer" ? "Seller" : "Buyer";

  return (
    <>
      <PageHeader
        meta={`${actor.orgName} · fictional ${actor.orgRole}`}
        title={`Hello, ${actor.displayName.split(" ")[0]}`}
        actions={
          actor.role === "buyer" ? (
            <Link href="/assessments/new" className={btn.primary}>
              New assessment <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null
        }
      >
        Requests, proof contracts and next steps for your organization. Everything here comes from this demo database, not from real
        customers.
      </PageHeader>

      <Card className="mb-8">
        <div className="flex flex-col gap-6 px-5 py-6 md:px-6 lg:flex-row lg:items-center">
          <div className="shrink-0 lg:w-[230px]">
            <h2 className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em]">The storyline</h2>
            <p className="mt-1 text-sm text-ink-3">
              {completed} of {steps.length} steps done
            </p>
            {allDone ? (
              <Link href={steps[5].href ?? "/replay"} className={cx(btn.marker, "mt-4")}>
                See what changed <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <Rail steps={steps} label="Demo storyline progress" />
          </div>
        </div>
      </Card>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader title="Requests" meta={`${requests.length} visible to ${actor.orgName}`} />
          {requests.length === 0 ? (
            <div className="p-5">
              <Empty
                title="No requests yet"
                action={
                  actor.role === "buyer" ? (
                    <Link href="/assessments/new" className={btn.primary}>
                      Start with the demo scenario <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  ) : (
                    <Link href="/settings" className={btn.secondary}>
                      Play the scripted storyline
                    </Link>
                  )
                }
              >
                {actor.role === "buyer"
                  ? "Describe an integration and get a cited fit verdict. The demo scenario fills the form in one click."
                  : "Requests appear here when a buyer submits one to your organization. Settings can also replay the whole storyline for you."}
              </Empty>
            </div>
          ) : (
            <>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="condensed text-[12px] tracking-[0.06em] text-ink-3 uppercase">
                  <tr className="border-b border-ink">
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Request
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Fit
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">
                      Proof
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.request.id} className="border-b border-steel transition-colors last:border-0 hover:bg-paper/60">
                      <td className="px-5 py-3.5">
                        <Link href={`/requests/${r.request.id}`} className="font-semibold text-ink hover:underline">
                          {r.request.title}
                        </Link>
                        <div className="mt-0.5 text-[14px] text-ink-3">
                          {counterpart}: {actor.orgRole === "buyer" ? r.sellerName : r.buyerName}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        {r.latestAssessment ? <StatusBadge status={r.latestAssessment.fitStatus} /> : "—"}
                        {r.contracts.some((c) => c.status === "PASSED") && r.latestAssessment?.fitStatus !== "CONDITIONAL_FIT" ? (
                          <span className="mt-1 block text-[12px] text-teal">Proof passed: re-run the assessment</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3.5">
                        {r.contracts[0] ? (
                          <StatusBadge contract status={r.contracts[0].status} />
                        ) : (
                          <span className="text-ink-3">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap text-ink-3 tabular">{formatDay(r.request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-steel md:hidden">
                {requests.map((r) => (
                  <li key={r.request.id}>
                    <Link href={`/requests/${r.request.id}`} className="block px-5 py-4 hover:bg-paper/60">
                      <span className="block font-semibold text-ink">{r.request.title}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        {r.latestAssessment ? <StatusBadge status={r.latestAssessment.fitStatus} /> : null}
                        {r.contracts[0] ? <StatusBadge contract status={r.contracts[0].status} /> : null}
                        <span className="text-[14px] text-ink-3">{formatDay(r.request.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="min-w-0 self-start">
          <CardHeader title="Waiting on you" meta={actor.role === "reviewer" ? "Reviewers only read" : `As ${actor.displayName}`} />
          {actions.length ? (
            <ul className="space-y-2 p-3">
              {actions.map((a, i) => (
                <li key={`${a.href}-${a.label}`}>
                  <Link
                    href={a.href}
                    className={cx(
                      "group flex items-center justify-between gap-3 rounded-[3px] px-4 py-3.5 text-sm transition-colors duration-150",
                      i === 0 ? "bg-ink text-white hover:bg-[#272c33]" : "bg-paper/70 text-ink hover:bg-mist",
                    )}
                  >
                    <span className="font-semibold">{a.label}</span>
                    <ArrowRight className="size-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : allDone ? (
            <div className="space-y-3 px-5 py-5 text-sm">
              <p className="flex items-start gap-2 text-ink-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
                The whole storyline is complete: the proof passed and the decision changed.
              </p>
              <Link href={steps[5].href ?? "/replay"} className="inline-flex items-center gap-1.5 font-semibold text-ink underline">
                See what changed <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ) : (
            <div className="space-y-3 px-5 py-5 text-sm">
              <p className="flex items-start gap-2 text-ink-2">
                <Inbox className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                Nothing needs you right now. {current ? `Next in the storyline: “${current.label}”.` : null}
              </p>
              {current?.href ? (
                <Link href={current.href} className="inline-flex items-center gap-1.5 font-semibold text-ink underline">
                  Open it <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
