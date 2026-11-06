import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { organizations } from "@/db/schema";
import { createMemoryDb } from "@/lib/db/client";
import { ORG } from "@/lib/demo/fixtures";
import { ensureSeeded, resetDemoData } from "@/lib/demo/seed";

const hostEnv = (value: string) => ({ DEMO_SELLER_PAYPAL_MERCHANT_ID: value }) as unknown as NodeJS.ProcessEnv;

describe("hosted demo: the seller's Sandbox payout account survives every reseed", () => {
  it("presets the seller's merchant ID from the host setting on seed and on reset, and ignores malformed values", async () => {
    const { db } = await createMemoryDb();
    const payeeOf = async (orgId: string) =>
      (await db.select({ id: organizations.paypalMerchantId }).from(organizations).where(eq(organizations.id, orgId)))[0].id;

    expect(await ensureSeeded(db, hostEnv(" lumenseller01 "))).toBe(true);
    expect(await payeeOf(ORG.lumen)).toBe("LUMENSELLER01");
    expect(await payeeOf(ORG.harbor)).toBeNull();

    await resetDemoData(db, hostEnv("not-a-merchant-id"));
    expect(await payeeOf(ORG.lumen)).toBeNull();

    await resetDemoData(db, hostEnv("LUMENSELLER01"));
    expect(await payeeOf(ORG.lumen)).toBe("LUMENSELLER01");

    await resetDemoData(db, {} as NodeJS.ProcessEnv);
    expect(await payeeOf(ORG.lumen)).toBeNull();
  });
});
