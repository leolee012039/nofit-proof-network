import { eq } from "drizzle-orm";
import { paypalOrders } from "@/db/schema";
import { FixtureApprove } from "@/components/client/fixture-approve";
import { Callout, Card, CardHeader, KeyValue, Mono, PageHeader } from "@/components/ui";
import { tenantOf } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { formatMoney } from "@/lib/money";
import { pageActor } from "@/lib/page";
import { getFixtureOrder } from "@/lib/paypal/fixture";

export const metadata = { title: "Simulated checkout (fixture)" };

export default async function FixtureCheckoutPage(props: PageProps<"/checkout/fixture/[orderId]">) {
  const { orderId } = await props.params;
  const actor = await pageActor();
  const row = await withTenant(
    tenantOf(actor),
    async (tx) => (await tx.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)))[0],
  );
  const provider = row ? await getFixtureOrder(orderId) : null;
  if (!row || !provider || row.providerMode !== "fixture" || actor.role !== "buyer") {
    return (
      <Callout tone="red" title="Not available">
        This simulated checkout is only available to the buyer who created the fixture order.
      </Callout>
    );
  }
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 rounded-[3px] border-2 border-dashed border-amber-line bg-amber-bg px-5 py-4 text-center">
        <p className="condensed text-[12px] font-extrabold tracking-[0.08em] text-amber uppercase">Simulated checkout — not PayPal</p>
        <p className="mt-1 text-sm text-ink-2">
          This page stands in for the PayPal approval step only because Sandbox credentials are not configured. No PayPal account, card or
          money is involved.
        </p>
      </div>
      <PageHeader title="Approve the simulated payment" />
      <Card>
        <CardHeader meta="Fixture provider order" title={formatMoney(row.amountMinor, row.currency)} />
        <div className="space-y-4 px-5 py-4">
          <KeyValue
            items={[
              ["Order", <Mono key="o">{orderId}</Mono>],
              ["Reference (contract)", <Mono key="r">{provider.referenceId}</Mono>],
              ["Provider status", provider.status],
            ]}
          />
          <FixtureApprove orderId={orderId} contractId={row.proofContractId} alreadyApproved={provider.status !== "CREATED"} />
        </div>
      </Card>
    </div>
  );
}
