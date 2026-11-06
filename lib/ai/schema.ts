import { z } from "zod";
import { FIT_STATUSES } from "@/lib/domain/states";
import type { Citation, Finding, PolicyResult } from "@/lib/policy/types";
import type { InjectionFlag } from "@/lib/knowledge/injection";

/** Shape the language model is asked to return (kept simple for structured outputs). */
export const ModelNarrative = z.object({
  explanation: z.string(),
  confidence_reason: z.string(),
  questions_for_buyer: z.array(z.string()),
  safe_alternatives: z.array(z.string()),
  /** The model's own opinion. Recorded for transparency; never used for the decision. */
  suggested_fit_status: z.enum(FIT_STATUSES),
});
export type ModelNarrative = z.infer<typeof ModelNarrative>;

/** Post-validation applied to any narrative (model or offline) before storage. */
export function sanitizeNarrative(n: ModelNarrative): ModelNarrative {
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  return {
    explanation: clip(n.explanation.trim(), 2500),
    confidence_reason: clip(n.confidence_reason.trim(), 800),
    questions_for_buyer: n.questions_for_buyer
      .slice(0, 6)
      .map((q) => clip(q.trim(), 300))
      .filter(Boolean),
    safe_alternatives: n.safe_alternatives
      .slice(0, 5)
      .map((q) => clip(q.trim(), 300))
      .filter(Boolean),
    suggested_fit_status: n.suggested_fit_status,
  };
}

export interface EvaluatorInfo {
  mode: "offline-fixture" | "live";
  label: string;
  provider?: "anthropic";
  model?: string;
  fallbackReason?: string;
  modelSuggestedStatus?: string;
  modelDisagreedWithPolicy?: boolean;
}

interface FindingOut {
  code: string;
  severity: string;
  original_severity?: string;
  title: string;
  detail: string;
  remediation?: string;
  citation_refs: string[];
  verified_by_outcome_ids?: string[];
}

/** The persisted assessment (required JSON shape from the brief, plus provenance). */
export interface AgentAssessment {
  fit_status: PolicyResult["fitStatus"];
  hard_blockers: FindingOut[];
  soft_risks: FindingOut[];
  missing_information: FindingOut[];
  needs_review: FindingOut[];
  conditions: FindingOut[];
  notices: FindingOut[];
  evidence_refs: Citation[];
  proposed_proof: PolicyResult["proposedProof"];
  explanation: string;
  confidence_reason: string;
  questions_for_buyer: string[];
  safe_alternatives: string[];
  reason_codes: string[];
  assumptions: string[];
  injection_flags: InjectionFlag[];
  outcomes_considered: PolicyResult["outcomesConsidered"];
  superseded_ignored: PolicyResult["supersededIgnored"];
  evaluator: EvaluatorInfo;
  policy_version: string;
}

function out(f: Finding): FindingOut {
  return {
    code: f.code,
    severity: f.severity,
    original_severity: f.originalSeverity,
    title: f.title,
    detail: f.detail,
    remediation: f.remediation,
    citation_refs: f.citationRefs,
    verified_by_outcome_ids: f.verifiedByOutcomeIds,
  };
}

/** Policy fields always win: the narrative cannot alter status, blockers or the proof offer. */
export function composeAssessment(policy: PolicyResult, narrative: ModelNarrative, evaluator: EvaluatorInfo): AgentAssessment {
  const by = (sev: Finding["severity"]) => policy.findings.filter((f) => f.severity === sev).map(out);
  return {
    fit_status: policy.fitStatus,
    hard_blockers: by("blocker"),
    soft_risks: by("risk"),
    missing_information: by("missing"),
    needs_review: by("review"),
    conditions: by("condition"),
    notices: by("info"),
    evidence_refs: policy.citations,
    proposed_proof: policy.proposedProof,
    explanation: narrative.explanation,
    confidence_reason: narrative.confidence_reason,
    questions_for_buyer: narrative.questions_for_buyer,
    safe_alternatives: narrative.safe_alternatives,
    reason_codes: policy.reasonCodes,
    assumptions: policy.assumptions,
    injection_flags: policy.injectionFlags,
    outcomes_considered: policy.outcomesConsidered,
    superseded_ignored: policy.supersededIgnored,
    evaluator: {
      ...evaluator,
      modelSuggestedStatus: evaluator.mode === "live" ? narrative.suggested_fit_status : undefined,
      modelDisagreedWithPolicy: evaluator.mode === "live" ? narrative.suggested_fit_status !== policy.fitStatus : undefined,
    },
    policy_version: policy.policyVersion,
  };
}
