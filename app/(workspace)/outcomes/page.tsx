import Link from "next/link";
import { Badge, Card, Empty, PageHeader, SealStrip, btn, cx, formatDay, input } from "@/components/ui";
import { failureLabel } from "@/lib/display";
import { pageActor } from "@/lib/page";
import { listOutcomes } from "@/lib/services/outcomes";

export const metadata = { title: "Outcome memory" };

const FILTERS = {
  result: ["PASS", "FAIL", "INCONCLUSIVE"],
  failureClass: ["NONE", "INSUFFICIENT_PERMISSION", "POLICY_VIOLATION", "UNSUPPORTED_ENVIRONMENT", "PRODUCT_DEFECT"],
  version: ["v3", "v1"],
  freshness: ["current", "expired"],
};
const FILTER_LABEL: Record<keyof typeof FILTERS, string> = {
  result: "Result",
  failureClass: "Failure",
  version: "HubSpot version",
  freshness: "Freshness",
};
const optionLabel = (k: keyof typeof FILTERS, v: string) =>
  k === "failureClass" ? (v === "NONE" ? "No failure" : failureLabel(v)) : k === "result" ? v[0] + v.slice(1).toLowerCase() : v;

/** Filters earn their space only once there is something to filter. */
const FILTER_THRESHOLD = 6;

const RESULT: Record<string, { label: string; ink: string }> = {
  PASS: { label: "Passed", ink: "text-teal" },
  FAIL: { label: "Failed", ink: "text-red" },
  INCONCLUSIVE: { label: "Inconclusive", ink: "text-amber" },
};

export default async function OutcomesPage(props: PageProps<"/outcomes">) {
  const actor = await pageActor();
  const q = await props.searchParams;
  const pick = (k: string) => (typeof q[k] === "string" && q[k] ? (q[k] as string) : undefined);
  const filters = {
    result: pick("result"),
    failureClass: pick("failureClass"),
    version: pick("version"),
    freshness: pick("freshness") as "current" | "expired" | undefined,
  };
  const filtering = Object.values(filters).some(Boolean);
  const rows = await listOutcomes(actor, filters);
  const total = filtering ? (await listOutcomes(actor)).length : rows.length;

  return (
    <>
      <PageHeader meta="Synthetic evidence · demo environment" title="Outcome memory">
        Every paid proof run leaves an append-only outcome record, failures included. A missing permission is recorded as that, never as a
        product defect. These records are what the next assessment cites.
      </PageHeader>

      {total > FILTER_THRESHOLD || filtering ? (
        <form className="mb-8 grid gap-3 rounded-[4px] border border-steel bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5" method="get">
          {(Object.keys(FILTERS) as Array<keyof typeof FILTERS>).map((k) => (
            <label key={k} className="text-sm">
              <span className="text-[14px] text-ink-3">{FILTER_LABEL[k]}</span>
              <select name={k} defaultValue={filters[k] ?? ""} className={cx(input, "mt-1")}>
                <option value="">Any</option>
                {FILTERS[k].map((v) => (
                  <option key={v} value={v}>
                    {optionLabel(k, v)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex items-end gap-2">
            <button type="submit" className={btn.primary}>
              Filter
            </button>
            <Link href="/outcomes" className="px-2 py-2 text-sm text-ink-3 underline hover:text-ink">
              Clear
            </Link>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <Empty title={filtering ? "No outcome records match" : "No outcome records yet"}>
          Outcomes are created when a paid proof run completes.
        </Empty>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rows.map(({ outcome: o, freshness, buyerName, sellerName }) => {
            const versions = o.testedVersionsJson as Record<string, string>;
            const conditions = o.conditionsJson as { approvalWorkflow?: boolean };
            const r = RESULT[o.result] ?? RESULT.INCONCLUSIVE;
            return (
              <Card key={o.id} as="article" className="flex flex-col overflow-hidden">
                <div className="px-6 pt-6 pb-5">
                  <h2 className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/outcomes/${o.id}`}
                      className={cx("font-display text-[22px] font-bold tracking-[-0.01em] hover:underline", r.ink)}
                    >
                      {r.label}
                    </Link>
                    {o.failureClass ? (
                      <span className="text-[16px] font-medium text-ink-2">{failureLabel(o.failureClass).toLowerCase()}</span>
                    ) : null}
                  </h2>
                  <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-ink">{o.actual}</p>
                  <p className="mt-4 flex flex-wrap gap-1.5">
                    {o.failureClass ? (
                      <Badge tone="red" mono>
                        {o.failureClass}
                      </Badge>
                    ) : null}
                    <Badge tone={freshness === "current" ? "teal" : "amber"}>{freshness === "current" ? "Current" : "Expired"}</Badge>
                    <Badge>Simulated environment</Badge>
                  </p>
                </div>
                <dl className="mt-auto grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 border-t border-steel bg-paper/60 px-6 py-4 text-[14px]">
                  <dt className="text-ink-3">Tested with</dt>
                  <dd>
                    HubSpot {versions.hubspot} ·{" "}
                    <span className="font-mono text-[12px]">{(o.grantedPermissionsJson as string[]).join(", ")}</span> · approval gate{" "}
                    {conditions.approvalWorkflow ? "on" : "off"}
                  </dd>
                  <dt className="text-ink-3">Between</dt>
                  <dd>
                    {buyerName} and {sellerName}
                  </dd>
                  <dt className="text-ink-3">Valid until</dt>
                  <dd className="tabular">{formatDay(o.expiresAt)}</dd>
                </dl>
                <SealStrip hash={o.artifactDigest} value="append-only outcome record" />
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
