import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { knowledgeSources, serviceCapabilities } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { sha256Hex } from "@/lib/crypto";
import { withTenant } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { newId } from "@/lib/ids";
import { screenForInjection } from "@/lib/knowledge/injection";
import { zodIssues } from "./requests";

export async function getKnowledgeBase(actorIn: Actor | null) {
  const actor = requireRole(actorIn, ["seller_admin", "reviewer"]);
  return withTenant(tenantOf(actor), async (tx) => {
    const capabilities = await tx
      .select()
      .from(serviceCapabilities)
      .where(eq(serviceCapabilities.organizationId, actor.orgId))
      .orderBy(serviceCapabilities.serviceKey, desc(serviceCapabilities.version));
    const sources = await tx
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.organizationId, actor.orgId))
      .orderBy(knowledgeSources.docKey, desc(knowledgeSources.version));
    return {
      capabilities,
      sources: sources.map((s) => ({ source: s, injection: screenForInjection(s) })),
    };
  });
}

const NewSourceInput = z.object({
  docKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{3,60}$/, "Use 3–60 lowercase letters, digits or dashes"),
  title: z.string().trim().min(3).max(120),
  sourceType: z.enum(["policy", "connector_note", "offering", "uploaded_document"]),
  content: z.string().trim().min(20).max(5000),
  tags: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[a-z0-9_]{2,30}$/),
    )
    .max(10)
    .default([]),
  visibility: z.enum(["buyer_visible", "seller_internal"]),
  trust: z.enum(["authored", "untrusted_upload"]),
});

/** Adds a new version of a knowledge document; earlier versions are kept and marked superseded. */
export async function addKnowledgeVersion(actorIn: Actor | null, input: unknown) {
  const actor = requireRole(actorIn, ["seller_admin"]);
  const parsed = NewSourceInput.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Please fix the highlighted fields.", { issues: zodIssues(parsed.error) });
  const v = parsed.data;
  return withTenant(tenantOf(actor), async (tx) => {
    const prior = await tx
      .select()
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.organizationId, actor.orgId), eq(knowledgeSources.docKey, v.docKey)))
      .orderBy(desc(knowledgeSources.version));
    const version = (prior[0]?.version ?? 0) + 1;
    if (prior.length) {
      await tx
        .update(knowledgeSources)
        .set({ status: "superseded" })
        .where(and(eq(knowledgeSources.organizationId, actor.orgId), eq(knowledgeSources.docKey, v.docKey)));
    }
    const [row] = await tx
      .insert(knowledgeSources)
      .values({
        id: newId("ks"),
        organizationId: actor.orgId,
        docKey: v.docKey,
        title: v.title,
        sourceType: v.sourceType,
        content: v.content,
        claimsJson: {},
        tagsJson: v.tags,
        hash: sha256Hex(v.content),
        version,
        visibility: v.visibility,
        trust: v.trust,
        status: "current",
      })
      .returning();
    await audit(tx, {
      organizationId: actor.orgId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "knowledge.version_added",
      targetType: "knowledge_source",
      targetId: row.id,
      metadata: { docKey: v.docKey, version, trust: v.trust },
    });
    return row;
  });
}

const PriceInput = z.object({ priceMinor: z.number().int().min(100).max(1_000_000) });

/** Price presets are versioned: a change creates a new capability version. Approved contracts keep their price. */
export async function updateCapabilityPrice(actorIn: Actor | null, capabilityId: string, input: unknown) {
  const actor = requireRole(actorIn, ["seller_admin"]);
  const parsed = PriceInput.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Price must be between USD 1.00 and USD 10,000.00.");
  return withTenant(tenantOf(actor), async (tx) => {
    const [cap] = await tx.select().from(serviceCapabilities).where(eq(serviceCapabilities.id, capabilityId));
    if (!cap) throw new AppError("NOT_FOUND", "Capability not found.");
    if (!cap.active) throw new AppError("INVALID_TRANSITION", "Only the active version can be re-priced.");
    // Compare-and-set: of two concurrent re-prices only one may retire this version.
    const retired = await tx
      .update(serviceCapabilities)
      .set({ active: false })
      .where(and(eq(serviceCapabilities.id, cap.id), eq(serviceCapabilities.active, true)))
      .returning({ id: serviceCapabilities.id });
    if (retired.length === 0) throw new AppError("CONFLICT", "This price was just changed by someone else. Refresh and try again.");
    const [next] = await tx
      .insert(serviceCapabilities)
      .values({
        ...cap,
        id: newId("cap"),
        version: cap.version + 1,
        basePriceMinor: parsed.data.priceMinor,
        active: true,
        createdAt: new Date(),
      })
      .returning();
    await audit(tx, {
      organizationId: actor.orgId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "capability.repriced",
      targetType: "service_capability",
      targetId: next.id,
      metadata: { from: cap.basePriceMinor, to: next.basePriceMinor, previousVersion: cap.version },
    });
    return next;
  });
}
