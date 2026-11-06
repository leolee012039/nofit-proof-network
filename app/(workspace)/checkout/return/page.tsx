import { CaptureOnReturn } from "@/components/client/capture-on-return";
import { Callout, PageHeader } from "@/components/ui";
import { pageActor } from "@/lib/page";

export const metadata = { title: "Returning from PayPal" };

/** PayPal redirect flow return URL: ?token=<orderId>&contract=<contractId>. Capture happens server-side. */
export default async function CheckoutReturnPage(props: PageProps<"/checkout/return">) {
  await pageActor();
  const q = await props.searchParams;
  const orderId = typeof q.token === "string" ? q.token : null;
  const contractId = typeof q.contract === "string" ? q.contract : null;
  if (!orderId || !contractId || !/^[A-Za-z0-9_-]{5,64}$/.test(orderId) || !/^pc_[a-z0-9]{6,32}$/.test(contractId)) {
    return (
      <Callout tone="red" title="Invalid return link">
        The PayPal return link is missing the order or contract reference.
      </Callout>
    );
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Verifying your PayPal Sandbox payment" />
      <CaptureOnReturn orderId={orderId} contractId={contractId} />
    </div>
  );
}
