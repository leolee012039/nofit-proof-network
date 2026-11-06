import { count, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Db, DbOrTx } from "@/lib/db/client";
import { getDemoSellerMerchantId } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import { ORG, USER, capabilitiesFixture, knowledgeFixture, organizationsFixture, profilesFixture } from "./fixtures";

/** Inserts the fictional base world. Idempotent (skips if organizations exist). */
export async function ensureSeeded(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(s.organizations);
  if (n > 0) return false;
  await db.transaction(async (tx) => insertBaseWorld(tx, env));
  return true;
}

export async function insertBaseWorld(tx: DbOrTx, env: NodeJS.ProcessEnv = process.env) {
  // A hosted demo can preset the seller's Sandbox payout account (DEMO_SELLER_PAYPAL_MERCHANT_ID).
  const sellerMerchantId = getDemoSellerMerchantId(env);
  await tx
    .insert(s.organizations)
    .values(organizationsFixture.map((o) => (o.id === ORG.lumen && sellerMerchantId ? { ...o, paypalMerchantId: sellerMerchantId } : o)));
  await tx.insert(s.profiles).values(profilesFixture);
  await tx.insert(s.serviceCapabilities).values(capabilitiesFixture);
  await tx.insert(s.knowledgeSources).values(knowledgeFixture.map((k) => ({ ...k, hash: sha256Hex(k.content) })));
  await tx.insert(s.sharingConsents).values({
    id: "con_brightline_lumen",
    organizationId: ORG.brightline,
    scope: "outcome_reuse_by_seller",
    grantee: ORG.lumen,
    grantedBy: USER.maya,
  });
}

/** Wipes all tenant data and re-inserts the fictional base world. */
export async function resetDemoData(db: Db, env: NodeJS.ProcessEnv = process.env) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      truncate table outcome_records, proof_runs, paypal_webhook_events, paypal_orders,
        fixture_provider_orders, proof_contracts, fit_assessments, buyer_requests,
        audit_events, sharing_consents, knowledge_sources, service_capabilities,
        profiles, organizations restart identity cascade
    `);
    await insertBaseWorld(tx, env);
  });
}
