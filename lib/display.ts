/**
 * Human wording for machine values shown in the UI. Codes stay available as
 * secondary text (tooltips, small mono) for people who want to verify them.
 */

const STATUS_LABEL: Record<string, string> = {
  FIT: "Fit",
  CONDITIONAL_FIT: "Conditional fit",
  NO_FIT: "Not a fit",
  INSUFFICIENT_INFORMATION: "Needs information",
  NEEDS_REVIEW: "Needs review",
  DRAFT: "Draft",
  PROPOSED: "Proposed",
  SELLER_APPROVED: "Seller approved",
  BUYER_ACCEPTED: "Accepted",
  PAYMENT_PENDING: "Awaiting payment",
  PAYMENT_FAILED: "Payment failed",
  PAID: "Paid",
  PROOF_QUEUED: "Proof queued",
  CANCELLED: "Cancelled",
  QUEUED: "Queued",
  RUNNING: "Running",
  PASSED: "Passed",
  FAILED: "Failed",
  INCONCLUSIVE: "Inconclusive",
  PASS: "Pass",
  FAIL: "Fail",
  CREATED: "Order created",
  APPROVED: "Approved by payer",
  CAPTURING: "Capturing",
  CAPTURED: "Captured",
  CAPTURE_PENDING: "Capture pending",
  CAPTURE_UNKNOWN: "Checking with provider",
  DENIED: "Declined",
  VERIFICATION_FAILED: "Verification failed",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partly refunded",
  REVERSED: "Reversed",
  VOIDED: "Voided",
};

/** Contract statuses that share a name with run statuses read differently on a contract. */
const CONTRACT_LABEL: Record<string, string> = {
  RUNNING: "Proof running",
  PASSED: "Proof passed",
  FAILED: "Proof failed",
  INCONCLUSIVE: "Proof inconclusive",
};

export function statusLabel(status: string, contract = false): string {
  return (contract ? CONTRACT_LABEL[status] : undefined) ?? STATUS_LABEL[status] ?? status.toLowerCase().replaceAll("_", " ");
}

const FAILURE_LABEL: Record<string, string> = {
  INSUFFICIENT_PERMISSION: "Missing permission",
  POLICY_VIOLATION: "Policy violation",
  UNSUPPORTED_ENVIRONMENT: "Unsupported environment",
  PRODUCT_DEFECT: "Product defect",
};

export function failureLabel(code: string): string {
  return FAILURE_LABEL[code] ?? code.toLowerCase().replaceAll("_", " ");
}

const AUDIT_LABEL: Record<string, string> = {
  "buyer_request.submitted": "Request submitted",
  "assessment.created": "Fit assessed",
  "assessment.updated_by_outcome": "Fit re-assessed with the passing proof",
  "assessment.overridden": "Recommendation overridden",
  "proof_contract.proposed": "Proof contract proposed",
  "proof_contract.seller_approved": "Seller approved the scope",
  "proof_contract.buyer_accepted": "Buyer accepted the scope",
  "proof_contract.cancelled": "Contract cancelled",
  "payment.order_created": "Checkout started",
  "payment.captured": "Payment captured and verified",
  "payment.captured_inactive_contract": "Money captured on an inactive contract (needs review)",
  "proof.queued": "Proof run queued",
  "payment.capture_pending": "Payment pending at provider",
  "payment.denied": "Payment declined",
  "payment.verification_failed": "Payment did not match the contract",
  "payment.webhook_processed": "PayPal webhook processed",
  "proof.executed": "Proof run executed",
  "proof.environment_changed": "Environment changed for a retest",
  "knowledge.version_added": "Knowledge document updated",
  "capability.repriced": "Price preset changed",
  "payout_account.updated": "Payout account changed",
};

export function auditLabel(action: string): string {
  return AUDIT_LABEL[action] ?? action.replaceAll(/[._]/g, " ");
}

/**
 * Exhibit numbers: every record in one request's chain carries the same strict
 * sequence (01 request, 02 verdict, 03 contract, 04 payment, 05+ proof runs).
 */
export const EXHIBIT = { request: "01", verdict: "02", contract: "03", payment: "04" } as const;

export function runExhibit(runNumber: number): string {
  return String(4 + runNumber).padStart(2, "0");
}

/** "188be754…683c": enough of a SHA-256 to recognise it; the full value stays in a tooltip. */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}
