import { AppError } from "./errors";

/** Proof contract lifecycle (enforced in code here and partially in Postgres triggers). */
export const CONTRACT_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "SELLER_APPROVED",
  "BUYER_ACCEPTED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PAID",
  "PROOF_QUEUED",
  "RUNNING",
  "PASSED",
  "FAILED",
  "INCONCLUSIVE",
  "NEEDS_REVIEW",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  DRAFT: ["PROPOSED", "CANCELLED"],
  PROPOSED: ["SELLER_APPROVED", "CANCELLED"],
  SELLER_APPROVED: ["BUYER_ACCEPTED", "CANCELLED"],
  BUYER_ACCEPTED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "NEEDS_REVIEW", "CANCELLED"],
  PAYMENT_FAILED: ["PAYMENT_PENDING", "CANCELLED"],
  PAID: ["PROOF_QUEUED", "NEEDS_REVIEW"],
  PROOF_QUEUED: ["RUNNING", "NEEDS_REVIEW"],
  RUNNING: ["PASSED", "FAILED", "INCONCLUSIVE"],
  FAILED: ["PROOF_QUEUED", "NEEDS_REVIEW"],
  INCONCLUSIVE: ["PROOF_QUEUED", "NEEDS_REVIEW"],
  PASSED: ["NEEDS_REVIEW"],
  NEEDS_REVIEW: ["PROOF_QUEUED", "CANCELLED"],
  // Only reachable if money moved for a cancelled contract (refund decision needed).
  CANCELLED: ["NEEDS_REVIEW"],
};

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertContractTransition(from: string, to: ContractStatus): void {
  if (!(CONTRACT_STATUSES as readonly string[]).includes(from) || !canTransitionContract(from as ContractStatus, to)) {
    throw new AppError("INVALID_TRANSITION", `Proof contract cannot move from ${from} to ${to}.`, { from, to });
  }
}

/** Local payment ledger states for a provider order. */
export const PAYMENT_STATES = [
  "CREATED",
  "APPROVED",
  "CAPTURING",
  "CAPTURED",
  "CAPTURE_PENDING",
  "CAPTURE_UNKNOWN",
  "DENIED",
  "VERIFICATION_FAILED",
  "VOIDED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "REVERSED",
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** States from which a capture attempt may begin (compare-and-set lock target). */
export const CAPTURABLE_STATES: readonly PaymentState[] = ["CREATED", "APPROVED", "CAPTURE_UNKNOWN"];
/** Non-terminal states a webhook or reconcile may resolve. */
export const RESOLVABLE_STATES: readonly PaymentState[] = ["CREATED", "APPROVED", "CAPTURING", "CAPTURE_PENDING", "CAPTURE_UNKNOWN"];

export const PROOF_RUN_STATUSES = ["QUEUED", "RUNNING", "PASSED", "FAILED", "INCONCLUSIVE", "CANCELLED"] as const;
export type ProofRunStatus = (typeof PROOF_RUN_STATUSES)[number];

export const FIT_STATUSES = ["FIT", "CONDITIONAL_FIT", "NO_FIT", "INSUFFICIENT_INFORMATION", "NEEDS_REVIEW"] as const;
export type FitStatus = (typeof FIT_STATUSES)[number];
