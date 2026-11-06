import { z } from "zod";

/**
 * A simulated integration environment. It represents the buyer-side grants and
 * seller-side controls the proof runner tests against. It never contains real
 * credentials and never points at a real HubSpot / LINE / Google account.
 */
export const ProofEnvironment = z.object({
  envVersion: z.string().min(1).max(40),
  hubspot: z.object({
    apiVersion: z.string().min(1).max(20),
    grantedScopes: z.array(z.string().min(1).max(60)).max(10),
  }),
  approvalWorkflow: z.object({ enabled: z.boolean() }),
  dataset: z.literal("synthetic-contacts-v1"),
});
export type ProofEnvironment = z.infer<typeof ProofEnvironment>;

export const ProofSpec = z.object({
  title: z.string(),
  hypothesis: z.string(),
  testCase: z.string(),
  steps: z.array(z.string()),
  passCriteria: z.array(z.string()),
  failCriteria: z.array(z.string()),
  limitations: z.array(z.string()),
  deliverables: z.array(z.string()),
  initialEnvironment: ProofEnvironment,
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  maxRuns: z.number().int().min(1).max(5),
  evidenceTtlDays: z.number().int().min(1).max(365),
  capabilityId: z.string(),
  capabilityVersion: z.number().int(),
});
export type ProofSpec = z.infer<typeof ProofSpec>;

/** The checks the simulated runner performs, by step id (kept in sync with runner.ts by a unit test). */
export const PROOF_CHECKS = {
  S1: "Connector manifest",
  S2: "OAuth scope check",
  S3: "Dry-run contact update",
  S4: "Human approval gate",
  S5: "Audit trail",
} as const;
export type ProofCheckId = keyof typeof PROOF_CHECKS;
export const PROOF_CHECK_IDS = Object.keys(PROOF_CHECKS) as [ProofCheckId, ...ProofCheckId[]];

export const RUNNER_VERSION = "nofit-sim-runner/1.0.0";
export const TEST_CASE_CRM_UPDATE = "TC-CRM-UPDATE-APPROVAL-01";
