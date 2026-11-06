import { NewSourceForm, PriceForm } from "@/components/client/knowledge-forms";
import { Badge, Callout, Card, CardHeader, Mono, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { guard, pageActor } from "@/lib/page";
import { getKnowledgeBase } from "@/lib/services/knowledge";

export const metadata = { title: "Knowledge base" };

export default async function KnowledgePage() {
  const actor = await pageActor();
  const res = await guard(() => getKnowledgeBase(actor));
  if (!res.ok) {
    return (
      <>
        <PageHeader title="Knowledge base" />
        <Callout tone="amber" title="Seller workspace only">
          Seller knowledge is private to the seller tenant (Postgres RLS). Buyers see only excerpts the seller marked buyer-visible, inside
          Fit Reports.
        </Callout>
      </>
    );
  }
  const { capabilities, sources } = res.value;
  const isSeller = actor.role === "seller_admin";
  return (
    <>
      <PageHeader meta={`${actor.orgName} · fictional documents`} title="Knowledge base">
        Service catalog, price presets, feasibility policies, connector notes and their versions. The policy engine only cites the latest
        version of each document.
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <CardHeader meta="Structured, versioned" title="Service catalog and price presets" />
          <ul className="divide-y divide-steel">
            {capabilities.map((c) => (
              <li key={c.id} className="space-y-2 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.displayName}</span>
                  <span className="text-[14px] text-ink-3">
                    {c.kind === "feasibility_proof" ? "Bounded proof" : "Implementation"} · v{c.version} ·{" "}
                    {c.active ? "active" : "superseded"}
                  </span>
                  <span className="ml-auto font-medium tabular">
                    {formatMoney(c.basePriceMinor, c.currency)} <span className="text-xs font-normal text-ink-3">demo price</span>
                  </span>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-ink-3">Supported tools and limitations (JSON)</summary>
                  <pre
                    tabIndex={0}
                    aria-label="Capability JSON"
                    className="mt-2 overflow-x-auto rounded bg-paper p-3 font-mono text-[12px] text-ink-2"
                  >
                    {JSON.stringify({ supportedTools: c.supportedToolsJson, limitations: c.limitationsJson }, null, 2)}
                  </pre>
                </details>
                {isSeller && c.active ? <PriceForm capabilityId={c.id} currentMinor={c.basePriceMinor} /> : null}
              </li>
            ))}
          </ul>
          <p className="border-t border-steel px-5 py-3 text-xs text-ink-3">
            Changing a price creates a new version. Contracts already approved keep their frozen price.
          </p>
        </Card>

        <Card>
          <CardHeader meta="Retrieval corpus" title="Knowledge sources" />
          <ul className="divide-y divide-steel">
            {sources.map(({ source: s, injection }) => (
              <li key={s.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-[14px] text-ink-3">
                    v{s.version} · {s.status === "current" ? "current" : "superseded"} ·{" "}
                    {s.visibility === "seller_internal" ? "seller-internal" : "buyer-visible"}
                  </span>
                  {s.trust === "untrusted_upload" ? <Badge tone="amber">Untrusted upload</Badge> : null}
                  {injection ? (
                    <Badge tone="amber" title={injection.patterns.join(", ")}>
                      Instruction-like text, ignored
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 leading-relaxed text-ink-2">{s.content}</p>
                <Mono className="mt-1 block text-ink-3">
                  {s.docKey} · sha256 {s.hash.slice(0, 16)}… · tags {s.tagsJson.join(", ")}
                </Mono>
              </li>
            ))}
          </ul>
        </Card>

        {isSeller ? (
          <Card>
            <CardHeader meta="Versioned" title="Add a document version" />
            <div className="px-5 py-4">
              <NewSourceForm />
            </div>
          </Card>
        ) : (
          <Callout>Read-only reviewer view.</Callout>
        )}
      </div>
    </>
  );
}
