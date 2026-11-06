import { and, eq, max } from "drizzle-orm";
import {
  buyerRequests,
  outcomeRecords,
  paypalOrders,
  proofContracts,
  proofRuns,
  type BuyerRequestRow,
  type ProofContractRow,
  type ProofRunRow,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireRole, tenantOf, type Actor } from "@/lib/auth/actor";
import { canonicalJson } from "@/lib/crypto";
import { withTenant, type Tx } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { assertContractTransition, type ContractStatus } from "@/lib/domain/states";
import { newId } from "@/lib/ids";
import { OUTCOME_REUSE_SCOPE } from "@/lib/policy/types";
import { fixtureHash, fixtureKeyFor, reproduceCommandFor, runProof } from "@/lib/proofs/runner";
import { ProofEnvironment, ProofSpec, RUNNER_VERSION } from "@/lib/proofs/types";
import { assessAndPersist, SYSTEM_AGENT_ID, type AssessOptions } from "./assessments";

async function requireCapturedPayment(tx: Tx, contractId: string) {
  const [paid] = await tx
    .select()
    .from(paypalOrders)
    .where(and(eq(paypalOrders.proofContractId, contractId), eq(paypalOrders.paymentState, "CAPTURED")));
  if (!paid) throw new AppError("PAYMENT_REQUIRED", "No verified captured payment for this contract. Proof execution is blocked.");
  return paid;
}

async function moveContract(tx: Tx, c: ProofContractRow, to: ContractStatus) {
  assertContractTransition(c.status, to);
  const [u] = await tx
    .update(proofContracts)
    .set({ status: to })
    .where(and(eq(proofContracts.id, c.id), eq(proofContracts.status, c.status)))
    .returning();
  if (!u) throw new AppError("CONFLICT", "Contract changed concurrently. Refresh and retry.");
  return u;
}

/**
 * A passing proof is new outcome evidence, so the request it was bought for is
 * re-assessed straight away. It runs after the run's transaction has committed,
 * so the new outcome is visible. The proof result stands even if this step
 * fails; "Re-run assessment" on the request page stays the manual fallback.
 */
async function reassessAfterPass(request: BuyerRequestRow, outcomeId: string, opts: AssessOptions) {
  try {
    const { assessment } = await assessAndPersist(request, SYSTEM_AGENT_ID, { ...opts, trigger: { outcomeId } });
    return { assessmentId: assessment.id, fitStatus: assessment.fitStatus };
  } catch (err) {
    console.warn("[nofit] automatic re-assessment after a passing proof failed", {
      requestId: request.id,
      outcomeId,
      reason: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
    });
    return null;
  }
}

/**
 * Executes a queued proof run. The runner receives only the test case and the
 * simulated environment snapshot — no database handle, no credentials.
 */
export async function executeProofRun(actorIn: Actor | null, runId: string, now = new Date(), assess: AssessOptions = {}) {
  const actor = requireRole(actorIn, ["seller_admin"]);
  const executed = await withTenant(tenantOf(actor), async (tx) => {
    const [run] = await tx.select().from(proofRuns).where(eq(proofRuns.id, runId));
    if (!run) throw new AppError("NOT_FOUND", "Proof run not found.");
    if (run.sellerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the seller can execute this proof.");
    if (run.status !== "QUEUED") throw new AppError("INVALID_TRANSITION", `Run is ${run.status}, not QUEUED.`);
    const [contract] = await tx.select().from(proofContracts).where(eq(proofContracts.id, run.proofContractId));
    const payment = await requireCapturedPayment(tx, contract.id);
    const running = await moveContract(tx, contract, "RUNNING");

    const startedAt = now;
    const [claimed] = await tx
      .update(proofRuns)
      .set({ status: "RUNNING", startedAt })
      .where(and(eq(proofRuns.id, run.id), eq(proofRuns.status, "QUEUED")))
      .returning();
    if (!claimed) throw new AppError("CONFLICT", "Run was already started.");

    const env = ProofEnvironment.parse(run.environmentJson);
    const exec = runProof(run.testCase, env);
    const status = exec.evidence.result;
    const [done] = await tx
      .update(proofRuns)
      .set({
        status,
        failureClass: exec.evidence.failureClass,
        stepsJson: exec.evidence.steps,
        logsJson: exec.evidence.logs,
        evidenceJson: exec.evidence,
        artifactDigest: exec.artifactDigest,
        reproduceCommand: exec.reproduceCommand,
        completedAt: new Date(startedAt.getTime() + exec.evidence.steps.reduce((n, s) => n + s.simulatedLatencyMs, 0)),
      })
      .where(eq(proofRuns.id, run.id))
      .returning();
    const finished = await moveContract(tx, running, status);

    const scope = contract.immutableScopeJson as { proof: unknown };
    const proof = ProofSpec.parse(scope.proof);
    const [outcome] = await tx
      .insert(outcomeRecords)
      .values({
        id: newId("out"),
        proofRunId: run.id,
        requestId: contract.requestId,
        proofContractId: contract.id,
        sellerOrganizationId: contract.sellerOrganizationId,
        buyerOrganizationId: contract.buyerOrganizationId,
        result: status === "PASSED" ? "PASS" : status === "FAILED" ? "FAIL" : "INCONCLUSIVE",
        failureClass: exec.evidence.failureClass,
        toolKeysJson: ["hubspot"],
        operationsJson: ["crm_read", "crm_write"],
        testedVersionsJson: { hubspot: env.hubspot.apiVersion, simulator: "hubspot-crm-sim/3 (simulated)", runner: RUNNER_VERSION },
        requiredPermissionsJson: ["contacts.read", "contacts.write"],
        grantedPermissionsJson: env.hubspot.grantedScopes,
        conditionsJson: { approvalWorkflow: env.approvalWorkflow.enabled, dataset: env.dataset },
        limitsJson: proof.limitations,
        expected: proof.passCriteria.join(" "),
        actual: exec.evidence.observed,
        evidenceIdsJson: [`run:${run.id}`, `sha256:${exec.artifactDigest}`, `fixture:${exec.inputFixtureHash}`],
        artifactDigest: exec.artifactDigest,
        verifierType: "deterministic_simulator",
        consentJson: {
          contractId: contract.id,
          scopeHash: contract.scopeHash,
          buyerAcceptedBy: contract.buyerAcceptedBy,
          buyerAcceptedAt: contract.buyerAcceptedAt?.toISOString() ?? null,
          scope: OUTCOME_REUSE_SCOPE,
        },
        paymentEvidenceJson: {
          note: "Payment evidence shows the test was paid for. It is not evidence of technical success.",
          providerMode: payment.providerMode,
          paypalOrderId: payment.paypalOrderId,
          captureId: payment.captureId,
          capturedAt: payment.capturedAt?.toISOString() ?? null,
        },
        environmentVersion: env.envVersion,
        expiresAt: new Date(now.getTime() + proof.evidenceTtlDays * 86_400_000),
      })
      .returning();

    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: contract.buyerOrganizationId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "proof.executed",
      targetType: "proof_run",
      targetId: run.id,
      metadata: { result: status, failureClass: exec.evidence.failureClass, artifactDigest: exec.artifactDigest, outcomeId: outcome.id },
    });
    const [request] = await tx.select().from(buyerRequests).where(eq(buyerRequests.id, contract.requestId));
    return { run: done, contract: finished, outcome, request };
  });
  const { request, ...result } = executed;
  const reassessment =
    result.outcome.result === "PASS" && request ? await reassessAfterPass(request, result.outcome.id, { now, ...assess }) : null;
  return { ...result, reassessment };
}

export interface RetestInput {
  grantWriteScope?: boolean;
  enableApproval?: boolean;
  reason?: string;
}

/**
 * Seller records a (fictional, simulated) environment change and queues a new
 * run under the same paid contract, bounded by max_runs.
 */
export async function queueRetest(actorIn: Actor | null, contractId: string, input: RetestInput): Promise<ProofRunRow> {
  const actor = requireRole(actorIn, ["seller_admin"]);
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 10) throw new AppError("VALIDATION", "Describe the environment change (10+ characters).");
  return withTenant(tenantOf(actor), async (tx) => {
    const [contract] = await tx.select().from(proofContracts).where(eq(proofContracts.id, contractId));
    if (!contract) throw new AppError("NOT_FOUND", "Proof contract not found.");
    if (contract.sellerOrganizationId !== actor.orgId) throw new AppError("FORBIDDEN", "Only the seller can queue a retest.");
    if (contract.status !== "FAILED" && contract.status !== "INCONCLUSIVE") {
      throw new AppError("INVALID_TRANSITION", `A retest can only follow a FAILED or INCONCLUSIVE run (contract is ${contract.status}).`);
    }
    await requireCapturedPayment(tx, contract.id);
    const [{ last }] = await tx
      .select({ last: max(proofRuns.runNumber) })
      .from(proofRuns)
      .where(eq(proofRuns.proofContractId, contract.id));
    const runCount = last ?? 0;
    if (runCount >= contract.maxRuns) throw new AppError("INVALID_TRANSITION", `This contract allows at most ${contract.maxRuns} runs.`);
    const [prev] = await tx
      .select()
      .from(proofRuns)
      .where(and(eq(proofRuns.proofContractId, contract.id), eq(proofRuns.runNumber, runCount)));
    const prevEnv = ProofEnvironment.parse(prev.environmentJson);
    const scopes = new Set(prevEnv.hubspot.grantedScopes);
    if (input.grantWriteScope) scopes.add("contacts.write");
    const next: ProofEnvironment = {
      envVersion: `env-${runCount + 1}`,
      hubspot: { apiVersion: prevEnv.hubspot.apiVersion, grantedScopes: ["contacts.read", "contacts.write"].filter((s) => scopes.has(s)) },
      approvalWorkflow: { enabled: input.enableApproval ?? prevEnv.approvalWorkflow.enabled },
      dataset: prevEnv.dataset,
    };
    const strip = (e: ProofEnvironment) => canonicalJson({ ...e, envVersion: "" });
    if (strip(next) === strip(prevEnv)) {
      throw new AppError(
        "VALIDATION",
        "Nothing changed. The runner is deterministic, so the same environment would produce the same evidence.",
      );
    }
    const testCase = prev.testCase;
    const [queued] = await tx
      .insert(proofRuns)
      .values({
        id: newId("run"),
        proofContractId: contract.id,
        buyerOrganizationId: contract.buyerOrganizationId,
        sellerOrganizationId: contract.sellerOrganizationId,
        runNumber: runCount + 1,
        fixtureKey: fixtureKeyFor(next),
        executorMode: "deterministic_simulator",
        testCase,
        environmentVersion: next.envVersion,
        environmentJson: next,
        status: "QUEUED",
        inputFixtureHash: fixtureHash(testCase, next),
        runnerVersion: RUNNER_VERSION,
        reproduceCommand: reproduceCommandFor(testCase, next, "<digest after run>"),
        queuedBy: actor.userId,
        queuedReason: reason,
      })
      .returning();
    await moveContract(tx, contract, "PROOF_QUEUED");
    await audit(tx, {
      organizationId: actor.orgId,
      counterpartyOrganizationId: contract.buyerOrganizationId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: "proof.environment_changed",
      targetType: "proof_run",
      targetId: queued.id,
      metadata: { from: prevEnv, to: next, reason, simulated: true },
    });
    return queued;
  });
}
