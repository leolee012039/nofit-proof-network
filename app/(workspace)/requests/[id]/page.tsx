import { ArrowRight, Check, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/client/action-button";
import { OverrideForm } from "@/components/client/override-form";
import { AuditTrail } from "@/components/audit-trail";
import { EvidencePanel, FindingsSection, VerdictHero } from "@/components/fit-report";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  Disclosure,
  ExhibitTag,
  KeyValue,
  PageHeader,
  StatusBadge,
  btn,
  formatDate,
  formatDay,
} from "@/components/ui";
import type { ProofContractRow } from "@/db/schema";
import { EXHIBIT, statusLabel } from "@/lib/display";
import { TOOL_LABELS, OPERATION_LABELS, type BuyerRequirement } from "@/lib/domain/requirements";
import { formatMoney } from "@/lib/money";
import { guard, pageActor } from "@/lib/page";
import { getRequestDetail } from "@/lib/services/requests";

export const metadata = { title: "Assessment workspace" };

const RESIDENCY: Record<string, string> = { none: "No requirement", us: "US only", eu: "EU only", jp: "Japan only" };
const APPROVAL: Record<string, string> = {
  fully_automatic: "Fully automatic",
  human_in_loop: "A person approves changes",
  undecided: "Not decided",
};
const OPEN_STATUSES = ["PROPOSED", "SELLER_APPROVED", "BUYER_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_FAILED"];

/** The one next step for this request, attached to the bottom of the verdict: exhibit 03, the proof. */
function NextStep({ contract, requestId }: { contract: ProofContractRow | undefined; requestId: string }) {
  if (!contract) return null;
  const title = (contract.immutableScopeJson as { contractTitle: string }).contractTitle;
  const price = formatMoney(contract.priceMinor, contract.currency);

  if (contract.status === "PASSED") {
    return (
      <div className="flex flex-col gap-4 border-t border-teal-line bg-teal-bg px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex min-w-0 gap-3">
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[2px] bg-teal text-white">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <div>
            <p className="font-semibold text-ink">Resolved: the {price} proof passed</p>
            <p className="mt-0.5 text-[16px] leading-relaxed text-ink-2">
              With the fix in place, the bounded test succeeded. The next request like this one is assessed with that evidence.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link href={`/replay?requestId=${requestId}`} className={btn.marker}>
            See what changed <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href={`/contracts/${contract.id}`}
            className="rounded-[2px] px-1 text-sm font-semibold text-ink underline underline-offset-4"
            data-testid="open-contract"
          >
            Open the proof
          </Link>
        </div>
      </div>
    );
  }

  const offering = OPEN_STATUSES.includes(contract.status);
  return (
    <div className="grid gap-5 border-t-2 border-dashed border-steel-2 bg-paper/60 px-5 py-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
      <div className="flex min-w-0 gap-4">
        <ExhibitTag n={EXHIBIT.contract} label="Proof contract" className="mt-0.5" />
        <div className="min-w-0">
          <p className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em] text-balance text-ink">
            {offering ? "Instead of the full project, buy a bounded proof" : "A bounded proof is under way"}
          </p>
          <p className="mt-1.5 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
            {title}. Up to {contract.maxRuns} runs. Status:{" "}
            <span className="font-semibold text-ink">{statusLabel(contract.status, true)}</span>.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 md:justify-end">
        <p className="font-display text-[40px] leading-none font-extrabold tracking-[-0.03em] text-ink tabular">{price}</p>
        <Link href={`/contracts/${contract.id}`} className={btn.marker} data-testid="open-contract">
          {offering ? "Review the proof" : "Open the proof"} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export default async function RequestPage(props: PageProps<"/requests/[id]">) {
  const { id } = await props.params;
  const actor = await pageActor();
  const res = await guard(() => getRequestDetail(actor, id));
  if (!res.ok)
    return (
      <Callout tone="red" title="Access denied">
        {res.message}
      </Callout>
    );
  const d = res.value;
  const latest = d.assessments[0];
  const req = d.request.requirementsJson as BuyerRequirement;
  const contract = d.contracts.find((c) => c.status !== "CANCELLED") ?? d.contracts.at(-1);

  return (
    <>
      <PageHeader
        size="record"
        meta={`${d.buyerName} → ${d.sellerName} · submitted ${formatDay(d.request.createdAt)}`}
        title={d.request.title}
        actions={
          actor.role === "seller_admin" || actor.role === "buyer" ? (
            <ActionButton url="/api/assess" body={{ requestId: d.request.id }} variant="secondary" testId="reassess">
              <RefreshCw className="size-4" aria-hidden /> Re-run assessment
            </ActionButton>
          ) : null
        }
      >
        {d.request.goal}
      </PageHeader>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          {latest ? (
            <VerdictHero
              a={latest.output}
              override={latest.override}
              seal={{ hash: latest.row.inputHash, at: latest.row.createdAt, policy: latest.row.policyVersion }}
              next={
                contract ? (
                  <NextStep contract={contract} requestId={d.request.id} />
                ) : latest.output.fit_status === "CONDITIONAL_FIT" ? (
                  <p className="border-t border-teal-line bg-teal-bg px-5 py-4 text-[16px] text-ink-2 sm:px-8">
                    No proof needed: earlier proof evidence already verified the conditions. Next step: scope the implementation with them.
                  </p>
                ) : null
              }
            />
          ) : (
            <Callout title="No assessment yet">Use “Re-run assessment” above to run it.</Callout>
          )}

          {latest ? <FindingsSection a={latest.output} /> : null}

          <div className="space-y-3">
            {latest ? <EvidencePanel a={latest.output} /> : null}
            {d.assessments.length > 1 ? (
              <Disclosure title="Earlier assessments" meta={`${d.assessments.length} versions; the newest is shown above`}>
                <ul className="divide-y divide-steel">
                  {d.assessments.map((a) => (
                    <li key={a.row.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="text-ink-3 tabular">#{a.row.sequence}</span>
                      <StatusBadge status={a.row.fitStatus} />
                      <span className="text-ink-3">
                        {a.row.evaluatorMode === "offline-fixture" ? "Offline evaluator" : a.row.evaluatorMode}
                      </span>
                      <span className="ml-auto text-[14px] text-ink-3 tabular">{formatDate(a.row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            ) : null}
            <AuditTrail events={d.events} />
          </div>
        </div>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader title="The request" meta="As the buyer submitted it" exhibit={EXHIBIT.request} />
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  [
                    "Budget",
                    <span key="b" className="tabular">
                      {formatMoney(req.budgetMinor, req.currency)}
                    </span>,
                  ],
                  ["Timeline", `${req.timelineDays} days`],
                  ["Does", req.operations.map((o) => OPERATION_LABELS[o]).join(", ")],
                  ["Data residency", RESIDENCY[req.compliance.dataResidency] ?? req.compliance.dataResidency],
                  ["CRM changes", APPROVAL[req.compliance.approvalMode] ?? req.compliance.approvalMode],
                  ["Personal data", req.compliance.containsPii ? "Yes" : "No"],
                ]}
              />
              <p className="condensed mt-5 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                Tools and permissions granted
              </p>
              <ul className="mt-2 space-y-2.5 text-sm">
                {req.tools.map((t) => (
                  <li key={t.key}>
                    <p className="font-semibold text-ink">
                      {TOOL_LABELS[t.key]}
                      {t.apiVersion ? <span className="font-normal text-ink-3"> · {t.apiVersion}</span> : null}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      {t.permissionsStatus === "unknown" ? (
                        <Badge tone="amber">Not sure</Badge>
                      ) : t.grantedPermissions.length ? (
                        t.grantedPermissions.map((p) => (
                          <Badge key={p} mono>
                            {p}
                          </Badge>
                        ))
                      ) : (
                        <Badge>None</Badge>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
              {req.notes ? (
                <>
                  <p className="condensed mt-5 text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">Notes</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{req.notes}</p>
                </>
              ) : null}
            </div>
          </Card>

          {actor.role === "seller_admin" && latest ? (
            <Card>
              <CardHeader title="Override the recommendation" meta="Recorded in the chain of custody" />
              <div className="px-5 py-4">
                <OverrideForm assessmentId={latest.row.id} current={latest.override?.status ?? latest.row.fitStatus} />
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
