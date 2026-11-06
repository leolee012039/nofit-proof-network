import type { PolicyResult } from "@/lib/policy/types";
import { formatMoney } from "@/lib/money";
import type { ModelNarrative } from "./schema";

/**
 * Offline deterministic evaluator. Produces the narrative from policy findings
 * with templates. No language model is called; the UI labels it as such.
 */
export function offlineNarrative(policy: PolicyResult): ModelNarrative {
  const refs = (r: string[]) => (r.length ? ` [${r.join(", ")}]` : "");
  const lines: string[] = [];

  const opening: Record<PolicyResult["fitStatus"], string> = {
    NO_FIT:
      "Not a fit for the requested scope as written. This is a decision about the unmodified scope — not a claim that the integration is impossible.",
    CONDITIONAL_FIT:
      "Conditional fit. The requested outcome looks feasible if specific conditions are met; those conditions were verified by earlier proof evidence in a simulated environment.",
    INSUFFICIENT_INFORMATION: "Not enough information to decide. Where evidence is missing, compatibility is not assumed.",
    NEEDS_REVIEW: "A human needs to resolve a policy conflict before this request can proceed.",
    FIT: "Fit. No blockers were found against the seller's documented capabilities and policies.",
  };
  lines.push(opening[policy.fitStatus]);

  for (const f of policy.findings) {
    if (f.severity === "blocker") lines.push(`Blocking: ${f.title}${refs(f.citationRefs)}. ${f.detail}`);
  }
  for (const f of policy.findings) {
    if (f.severity === "review") lines.push(`Needs review: ${f.title}${refs(f.citationRefs)}.`);
  }
  for (const f of policy.findings) {
    if (f.severity === "missing") lines.push(`Missing information: ${f.title}${refs(f.citationRefs)}.`);
  }
  for (const f of policy.findings) {
    if (f.severity === "condition") lines.push(`Condition: ${f.remediation ?? f.title}${refs(f.citationRefs)}.`);
  }
  if (policy.proposedProof) {
    const p = policy.proposedProof;
    lines.push(
      `Instead of committing to the full implementation, the seller can run a bounded feasibility proof for ${formatMoney(p.priceMinor, p.currency)} (demo price) that tests exactly the remediated configuration in a simulated environment.`,
    );
  }
  if (policy.injectionFlags.length) {
    lines.push(
      `${policy.injectionFlags.length} retrieved document(s) contained instruction-like text. It was treated as data and had no effect on this decision.`,
    );
  }

  const limits: string[] = [];
  if (policy.assumptions.length) limits.push(`${policy.assumptions.length} unstated detail(s) were assumed and must be confirmed`);
  if (policy.findings.some((f) => f.verifiedByOutcomeIds?.length))
    limits.push("verification evidence comes from a simulated environment, not the buyer's live systems");
  if (policy.outcomesConsidered.some((o) => !o.usable)) limits.push("some outcome records were excluded as stale or irrelevant");
  const confidence = [
    "Status and blockers come from deterministic checks of buyer-stated facts against versioned seller sources, so they are reproducible.",
    limits.length ? `Confidence is limited because ${limits.join("; ")}.` : "Nothing was verified against the buyer's real systems.",
  ].join(" ");

  const questions: string[] = [];
  const alternatives: string[] = [];
  for (const f of policy.findings) {
    if (f.code === "R-CRM-WRITE-SCOPE" && f.severity === "blocker") {
      questions.push("Can your HubSpot administrator grant the contacts.write scope to the integration?");
      alternatives.push(
        "Start read-only: route LINE messages to Google Sheets and read HubSpot contacts without writing (no write scope needed).",
      );
    }
    if (f.code === "R-HUMAN-APPROVAL-CONFLICT" && f.severity === "review") {
      questions.push("Would you accept a human approval step before CRM records are changed?");
    }
    if (f.code === "R-PERMISSION-UNKNOWN")
      questions.push(
        `Which permissions does the integration currently hold (${f.title.replace("Granted ", "").replace(" permissions are unknown", "")})?`,
      );
    if (f.code === "R-LEAD-TIME") alternatives.push("Split delivery: a smaller first phase inside your timeline, the rest later.");
    if (f.code === "R-API-VERSION-EXPIRED" && f.remediation) alternatives.push(f.remediation);
  }
  if (policy.proposedProof) alternatives.push("Buy the bounded proof first and decide on the full implementation with evidence in hand.");

  return {
    explanation: lines.join("\n\n"),
    confidence_reason: confidence,
    questions_for_buyer: [...new Set(questions)],
    safe_alternatives: [...new Set(alternatives)],
    suggested_fit_status: policy.fitStatus,
  };
}
