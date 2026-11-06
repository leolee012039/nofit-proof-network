import { auditEvents } from "@/db/schema";
import type { DbOrTx } from "@/lib/db/client";
import { newId } from "@/lib/ids";

export interface AuditInput {
  organizationId: string;
  counterpartyOrganizationId?: string | null;
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  /** Never put secrets, tokens or raw payer data here. */
  metadata?: Record<string, unknown>;
}

export async function audit(tx: DbOrTx, e: AuditInput) {
  await tx.insert(auditEvents).values({
    id: newId("aud"),
    organizationId: e.organizationId,
    counterpartyOrganizationId: e.counterpartyOrganizationId ?? null,
    actorId: e.actorId,
    actorRole: e.actorRole,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadataJson: e.metadata ?? {},
  });
}
