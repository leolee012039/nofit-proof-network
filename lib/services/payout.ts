import { eq } from "drizzle-orm";
import { organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { withTenant } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";

/** PayPal merchant (payer) IDs: 13 upper-case letters and digits, as the database also enforces. */
export const MERCHANT_ID = /^[A-Z0-9]{13}$/;

export async function getPayoutAccount(actorIn: Actor | null): Promise<string | null> {
  const actor = requireRole(actorIn, ["seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const [org] = await tx.select({ id: organizations.paypalMerchantId }).from(organizations).where(eq(organizations.id, actor.orgId));
    return org?.id ?? null;
  });
}

/**
 * The seller names the PayPal merchant account that receives its proof payments.
 * Later orders name it as payee, and capture verification checks it. An empty
 * value clears it, and payments go to the app's own merchant account again.
 */
export async function setPayoutAccount(actorIn: Actor | null, body: { merchantId?: unknown }) {
  const actor = requireRole(actorIn, ["seller_admin"]);
  if (body.merchantId !== undefined && body.merchantId !== null && typeof body.merchantId !== "string") {
    throw new AppError("VALIDATION", "merchantId must be a string.");
  }
  const merchantId = (body.merchantId ?? "").trim().toUpperCase();
  if (merchantId && !MERCHANT_ID.test(merchantId)) {
    throw new AppError(
      "VALIDATION",
      "A PayPal merchant ID is 13 letters and digits. Find it in PayPal under Account settings → Business information.",
    );
  }
  return withTenant(tenantOf(actor), async (tx) => {
    const [org] = await tx
      .update(organizations)
      .set({ paypalMerchantId: merchantId || null })
      .where(eq(organizations.id, actor.orgId))
      .returning({ id: organizations.paypalMerchantId });
    if (!org) throw new AppError("NOT_FOUND", "Organization not found.");
    await audit(tx, {
      organizationId: actor.orgId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "payout_account.updated",
      targetType: "organization",
      targetId: actor.orgId,
      metadata: { paypalMerchantId: merchantId || null },
    });
    return { paypalMerchantId: org.id };
  });
}
