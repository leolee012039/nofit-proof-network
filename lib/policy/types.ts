import { z } from "zod";
import { Operation } from "@/lib/domain/requirements";
import type { FitStatus } from "@/lib/domain/states";
import type { InjectionFlag } from "@/lib/knowledge/injection";
import type { ProofSpec } from "@/lib/proofs/types";

export const POLICY_VERSION = "nofit-policy/2026.10.1";

/** The consent scope under which a seller may reuse a buyer's proof outcomes in later assessments. */
export const OUTCOME_REUSE_SCOPE = "outcome_reuse_by_seller";

export const ToolCapability = z.object({
  label: z.string(),
  apiVersions: z.array(z.string()),
  deprecatedVersions: z.array(z.string()).default([]),
  operations: z.array(Operation),
  requiredPermissions: z.record(z.string(), z.array(z.string())).default({}),
  sourceDocKey: z.string().optional(),
});
export type ToolCapability = z.infer<typeof ToolCapability>;

export const SupportedTools = z.record(z.string(), ToolCapability);

export const ImplementationLimitations = z.object({
  minLeadTimeDays: z.number().int().nonnegative(),
  dataRegions: z.array(z.enum(["us", "eu", "jp"])),
  productionCrmWritesRequireHumanApproval: z.boolean(),
  maxTools: z.number().int().positive(),
  policyDocKeys: z
    .object({
      crmWrite: z.string().optional(),
      leadTime: z.string().optional(),
      residency: z.string().optional(),
      proofOffering: z.string().optional(),
    })
    .default({}),
});
export type ImplementationLimitations = z.infer<typeof ImplementationLimitations>;

export const ProofLimitations = z.object({
  maxRuns: z.number().int().min(1).max(5),
  evidenceTtlDays: z.number().int().min(1),
  executor: z.literal("deterministic_simulator"),
  testCases: z.array(z.string()),
});
export type ProofLimitations = z.infer<typeof ProofLimitations>;

export type FindingSeverity = "blocker" | "review" | "missing" | "condition" | "risk" | "info";

export interface Citation {
  ref: string;
  kind: "knowledge" | "capability" | "outcome";
  sourceId: string;
  docKey?: string;
  title: string;
  version: number | string;
  excerpt: string;
  visibility: "buyer_visible" | "seller_internal";
  trust?: "authored" | "untrusted_upload";
}

export interface Finding {
  code: string;
  severity: FindingSeverity;
  originalSeverity?: FindingSeverity;
  title: string;
  detail: string;
  citationRefs: string[];
  remediable: boolean;
  remediation?: string;
  verifiedByOutcomeIds?: string[];
  tool?: string;
}

/** An outcome record as seen by the policy engine (integrity checked by the caller). */
export interface OutcomeEvidence {
  id: string;
  proofRunId: string;
  result: "PASS" | "FAIL" | "INCONCLUSIVE";
  failureClass: string | null;
  toolKeys: string[];
  operations: string[];
  testedVersions: Record<string, string>;
  grantedPermissions: string[];
  conditions: { approvalWorkflow?: boolean };
  artifactDigest: string;
  integrity: "valid" | "invalid";
  /** Reuse consent: captured at contract acceptance, revocable by the buyer organization. */
  consent: "granted" | "revoked" | "missing";
  expiresAt: Date;
  environmentVersion: string;
  createdAt: Date;
}

export interface PolicyResult {
  fitStatus: FitStatus;
  findings: Finding[];
  citations: Citation[];
  reasonCodes: string[];
  assumptions: string[];
  injectionFlags: InjectionFlag[];
  supersededIgnored: Array<{ id: string; docKey: string; version: number; currentVersion: number }>;
  outcomesConsidered: Array<{ id: string; usable: boolean; reason: string }>;
  proposedProof: ProofSpec | null;
  policyVersion: string;
}
