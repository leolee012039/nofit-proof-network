import Link from "next/link";
import { Badge, Card, Empty, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { pageActor } from "@/lib/page";
import { listContracts } from "@/lib/services/contracts";

export const metadata = { title: "Proof contracts" };

export default async function ContractsPage() {
  const actor = await pageActor();
  const rows = await listContracts(actor);
  return (
    <>
      <PageHeader meta="Seller-approved, buyer-accepted, paid, then proven" title="Proof contracts">
        Each contract freezes scope and price at seller approval (SHA-256). Payment unlocks the bounded proof; it never implies success.
      </PageHeader>
      {rows.length === 0 ? (
        <Empty title="No proof contracts yet">Contracts are proposed automatically when an assessment finds remediable blockers.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-ink-3">
              <tr className="border-b border-steel">
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Contract
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Parties
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Price
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Payment
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contract: c, buyerName, sellerName, latestOrder }) => (
                <tr key={c.id} className="border-b border-steel last:border-0 hover:bg-paper">
                  <td className="px-5 py-3">
                    <Link href={`/contracts/${c.id}`} className="font-medium underline-offset-2 hover:underline">
                      {(c.immutableScopeJson as { contractTitle: string }).contractTitle}
                    </Link>
                    <div className="font-mono text-[12px] text-ink-3">{c.id}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-2">
                    {buyerName} → {sellerName}
                  </td>
                  <td className="px-3 py-3 tabular">{formatMoney(c.priceMinor, c.currency)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge contract status={c.status} />
                  </td>
                  <td className="px-3 py-3">
                    {latestOrder ? (
                      <span className="flex flex-wrap gap-1">
                        <StatusBadge status={latestOrder.paymentState} />
                        <Badge tone={latestOrder.providerMode === "sandbox" ? "teal" : "amber"}>
                          {latestOrder.providerMode === "sandbox" ? "PayPal Sandbox" : "Simulated"}
                        </Badge>
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-3 tabular">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
