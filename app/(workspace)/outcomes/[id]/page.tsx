import Link from "next/link";
import { ProofRunCard } from "@/components/proof-run-card";
import { Badge, Callout, Card, CardHeader, Finding, KeyValue, Mono, PageHeader, SealStrip, formatDate } from "@/components/ui";
import { failureLabel, runExhibit } from "@/lib/display";
import { guard, pageActor } from "@/lib/page";
import { personName } from "@/lib/people";
import { getOutcomeDetail } from "@/lib/services/outcomes";

export const metadata = { title: "Outcome evidence" };

export default async function OutcomeDetailPage(props: PageProps<"/outcomes/[id]">) {
  const { id } = await props.params;
  const actor = await pageActor();
  const res = await guard(() => getOutcomeDetail(actor, id));
  if (!res.ok)
    return (
      <Callout tone="red" title="Access denied">
        {res.message}
      </Callout>
    );
  const { outcome: o, run, integrity, recomputedDigest, freshness } = res.value;
  const payment = o.paymentEvidenceJson as {
    note: string;
    providerMode: string;
    paypalOrderId: string;
    captureId: string | null;
    capturedAt: string | null;
  };
  const consent = o.consentJson as {
    contractId: string;
    scopeHash: string;
    buyerAcceptedBy: string | null;
    buyerAcceptedAt: string | null;
    scope: string;
  };
  const versions = o.testedVersionsJson as Record<string, string>;
  const conditions = o.conditionsJson as { approvalWorkflow?: boolean; dataset?: string };
  const verb = o.result === "PASS" ? "passed" : o.result === "FAIL" ? "failed" : "was inconclusive";
  const title = `Proof run ${run?.runNumber ?? ""} ${verb}${o.failureClass ? `: ${failureLabel(o.failureClass).toLowerCase()}` : ""}`;

  return (
    <>
      <PageHeader
        meta={`Outcome record ${o.id} · append-only · synthetic evidence`}
        title={title}
        exhibit={run ? runExhibit(run.runNumber) : undefined}
      >
        <span className="flex flex-wrap items-center gap-2">
          <Finding status={o.result} size="sm" />
          <Badge tone={integrity === "valid" ? "teal" : "red"}>
            {integrity === "valid" ? "Evidence digest verified" : "Digest mismatch"}
          </Badge>
          <Badge tone={freshness === "current" ? "teal" : "amber"}>{freshness === "current" ? "Current" : "Expired"}</Badge>
        </span>
      </PageHeader>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-8">
          <Card>
            <CardHeader title="Expected and observed" />
            <div className="space-y-4 px-5 py-5 text-[16px] leading-relaxed">
              <p>
                <span className="font-medium text-ink">Expected.</span> <span className="text-ink-2">{o.expected}</span>
              </p>
              <p>
                <span className="font-medium text-ink">Observed.</span> <span className="text-ink-2">{o.actual}</span>
              </p>
              <p className="text-sm text-ink-3">
                The failure class separates an environment or permission problem from a real product defect, so a failure like this one
                never counts against the seller&apos;s product.
              </p>
              <div>
                <p className="font-medium text-ink">Limits of this evidence</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                  {(o.limitsJson as string[]).map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          {run ? <ProofRunCard run={run} /> : null}
        </div>
        <aside className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Tested conditions" />
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  ["HubSpot", `${versions.hubspot ?? "?"} (simulated)`],
                  ["Permissions required", <Mono key="r">{(o.requiredPermissionsJson as string[]).join(", ")}</Mono>],
                  ["Permissions granted", <Mono key="g">{(o.grantedPermissionsJson as string[]).join(", ") || "none"}</Mono>],
                  ["Approval gate", conditions.approvalWorkflow ? "On" : "Off"],
                  ["Dataset", conditions.dataset ?? "—"],
                  ["Verified by", o.verifierType === "deterministic_simulator" ? "Deterministic simulator" : o.verifierType],
                  ["Valid until", formatDate(o.expiresAt)],
                ]}
              />
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Integrity" meta="The digest is recomputed from the stored evidence every time it is used" />
            <SealStrip
              state={integrity === "valid" ? "sealed" : "void"}
              label={integrity === "valid" ? "Sealed" : "Broken"}
              hash={o.artifactDigest}
              value={integrity === "valid" ? "matches the recomputed digest" : "does not match the recomputed digest"}
            />
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  ["Stored", <Mono key="d">{o.artifactDigest}</Mono>],
                  ["Recomputed", <Mono key="rd">{recomputedDigest ?? "—"}</Mono>],
                  [
                    "Evidence",
                    <ul key="e" className="space-y-0.5">
                      {(o.evidenceIdsJson as string[]).map((x) => (
                        <li key={x}>
                          <Mono>{x}</Mono>
                        </li>
                      ))}
                    </ul>,
                  ],
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Permission to reuse" />
            <div className="px-5 py-4 text-sm">
              <KeyValue
                items={[
                  ["Scope", consent.scope === "outcome_reuse_by_seller" ? "The seller may cite it in future assessments" : consent.scope],
                  [
                    "Contract",
                    <Link key="c" href={`/contracts/${consent.contractId}`} className="underline">
                      Open the proof contract
                    </Link>,
                  ],
                  ["Accepted by", `${personName(consent.buyerAcceptedBy)} · ${formatDate(consent.buyerAcceptedAt)}`],
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader
              title={payment.providerMode === "sandbox" ? "Paid with PayPal Sandbox" : "Paid with the simulated provider (not PayPal)"}
            />
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="text-ink-2">{payment.note}</p>
              <KeyValue
                items={[
                  ["Order", <Mono key="o">{payment.paypalOrderId}</Mono>],
                  ["Capture", <Mono key="c">{payment.captureId ?? "—"}</Mono>],
                  ["Captured", formatDate(payment.capturedAt)],
                ]}
              />
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
