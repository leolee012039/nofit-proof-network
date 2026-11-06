import { eq } from "drizzle-orm";
import { organizations } from "@/db/schema";
import { IntakeForm } from "@/components/client/intake-form";
import { Callout, PageHeader } from "@/components/ui";
import { tenantOf } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { ORG } from "@/lib/demo/fixtures";
import { pageActor } from "@/lib/page";

export const metadata = { title: "New assessment" };

export default async function NewAssessmentPage() {
  const actor = await pageActor();
  if (actor.role !== "buyer") {
    return (
      <>
        <PageHeader title="New assessment" />
        <Callout tone="amber" title="Buyers only">
          Only a buyer can submit requirements. Switch persona to <strong>Maya Chen (Buyer)</strong>.
        </Callout>
      </>
    );
  }
  const sellers = await withTenant(tenantOf(actor), (tx) => tx.select().from(organizations).where(eq(organizations.role, "seller")));
  return (
    <>
      <PageHeader meta="Buyer intake" title="New fit assessment">
        Describe the integration in your own words and let AI draft the form, or fill it in yourself. The seller&apos;s deterministic policy
        engine then checks it against versioned knowledge and returns a Fit Report with citations.
      </PageHeader>
      <IntakeForm
        demoSellerId={ORG.lumen}
        sellers={sellers
          .sort((a, b) => Number(b.id === ORG.lumen) - Number(a.id === ORG.lumen) || a.name.localeCompare(b.name))
          .map((s) => ({ id: s.id, name: s.name, description: s.description }))}
      />
    </>
  );
}
