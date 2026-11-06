import { desc } from "drizzle-orm";
import Link from "next/link";
import { paypalOrders, paypalWebhookEvents } from "@/db/schema";
import { Badge, Card, CardHeader, Empty, Mono, PageHeader, StatusBadge, formatDate } from "@/components/ui";
import { tenantOf } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { formatMoney } from "@/lib/money";
import { pageActor } from "@/lib/page";
import { getSystemStatus } from "@/lib/services/system";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const actor = await pageActor();
  const { orders, webhooks } = await withTenant(tenantOf(actor), async (tx) => ({
    orders: await tx.select().from(paypalOrders).orderBy(desc(paypalOrders.createdAt)),
    webhooks: await tx.select().from(paypalWebhookEvents).orderBy(desc(paypalWebhookEvents.receivedAt)),
  }));
  const status = getSystemStatus();
  return (
    <>
      <PageHeader meta={status.payment.label} title="Transactions">
        Server-side payment ledger and verified webhook events for your organization. Amounts are integer minor units fixed by the contract,
        never by the browser.
      </PageHeader>

      <div className="space-y-6">
        <Card className="overflow-x-auto">
          <CardHeader title="Payment ledger" meta={`${orders.length} order(s)`} />
          {orders.length === 0 ? (
            <div className="p-5">
              <Empty title="No payments yet">Payments appear after a buyer starts checkout on an accepted proof contract.</Empty>
            </div>
          ) : (
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-ink-3">
                <tr className="border-b border-steel">
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Provider order
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Mode
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    State
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Capture
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Contract
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-steel last:border-0">
                    <td className="px-5 py-3">
                      <Mono>{o.paypalOrderId}</Mono>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={o.providerMode === "sandbox" ? "teal" : "amber"}>
                        {o.providerMode === "sandbox" ? "PayPal Sandbox" : "Simulated — not PayPal"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 tabular">{formatMoney(o.amountMinor, o.currency)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={o.paymentState} />
                    </td>
                    <td className="px-3 py-3">{o.captureId ? <Mono>{o.captureId}</Mono> : <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-3">
                      <Link href={`/contracts/${o.proofContractId}`} className="font-mono text-[12px] underline underline-offset-2">
                        {o.proofContractId}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-3 tabular">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="overflow-x-auto">
          <CardHeader title="Verified webhook events" meta="Signature-verified before storage · deduplicated by event id">
            Only a sanitized summary and the SHA-256 of each payload are stored. Fixture mode never accepts webhooks.
          </CardHeader>
          {webhooks.length === 0 ? (
            <div className="p-5">
              <Empty title="No verified webhook events">
                {status.payment.kind === "sandbox"
                  ? status.payment.webhookConfigured
                    ? "Waiting for PayPal to deliver events to /api/paypal/webhook (requires a public HTTPS URL)."
                    : "PAYPAL_WEBHOOK_ID is not configured; events would be rejected."
                  : "Webhooks are only accepted in PayPal Sandbox mode."}
              </Empty>
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-ink-3">
                <tr className="border-b border-steel">
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Event
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Verified
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Result
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Payload SHA-256
                  </th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id} className="border-b border-steel last:border-0">
                    <td className="px-5 py-3">
                      <Mono>{w.paypalEventId}</Mono>
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px]">{w.eventType}</td>
                    <td className="px-3 py-3">
                      <Badge tone={w.verified ? "teal" : "red"}>{w.verified ? `Verified (${w.verificationMethod})` : "Not verified"}</Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px]">{w.processingResult}</td>
                    <td className="px-5 py-3">
                      <Mono>{w.payloadDigest.slice(0, 24)}…</Mono>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
