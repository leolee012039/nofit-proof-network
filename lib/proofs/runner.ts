import { canonicalJson, sha256Canonical } from "@/lib/crypto";
import { RUNNER_VERSION, TEST_CASE_CRM_UPDATE, type ProofEnvironment } from "./types";

/**
 * Deterministic proof runner. It SIMULATES a HubSpot-like CRM permission model
 * and an approval gate; it never calls HubSpot, LINE or Google. Identical input
 * always yields identical steps, logs and artifact digest, so any evidence
 * record can be re-derived with `npm run proof:replay`.
 */

export type StepStatus = "PASS" | "FAIL" | "SKIPPED";
export type FailureClass = "INSUFFICIENT_PERMISSION" | "POLICY_VIOLATION" | "UNSUPPORTED_ENVIRONMENT" | "PRODUCT_DEFECT";

export interface ProofStepResult {
  id: string;
  name: string;
  status: StepStatus;
  code?: string;
  detail: string;
  simulatedLatencyMs: number;
}

export interface ProofLogLine {
  offset: string;
  level: "INFO" | "WARN" | "ERROR";
  step: string;
  message: string;
}

export interface ProofEvidence {
  simulated: true;
  runnerVersion: string;
  testCase: string;
  inputFixtureHash: string;
  environment: ProofEnvironment;
  steps: ProofStepResult[];
  logs: ProofLogLine[];
  result: "PASSED" | "FAILED" | "INCONCLUSIVE";
  failureClass: FailureClass | null;
  observed: string;
}

export interface ProofExecution {
  evidence: ProofEvidence;
  artifactDigest: string;
  inputFixtureHash: string;
  reproduceCommand: string;
}

const CONTACT = "SYN-C-0042";

export function fixtureHash(testCase: string, env: ProofEnvironment): string {
  return sha256Canonical({ testCase, env });
}

export function evidenceDigest(evidence: ProofEvidence): string {
  return sha256Canonical(evidence);
}

export function reproduceCommandFor(testCase: string, env: ProofEnvironment, digest: string): string {
  const b64 = Buffer.from(canonicalJson(env)).toString("base64url");
  return `npm run proof:replay -- --test-case ${testCase} --env-b64 ${b64} --expect ${digest}`;
}

export function runProof(testCase: string, env: ProofEnvironment): ProofExecution {
  if (testCase !== TEST_CASE_CRM_UPDATE) throw new Error(`Unknown test case ${testCase}`);
  const steps: ProofStepResult[] = [];
  const logs: ProofLogLine[] = [];
  let clock = 0;
  const state: { failure: { cls: FailureClass; result: "FAILED" | "INCONCLUSIVE"; observed: string } | null } = { failure: null };

  const log = (level: ProofLogLine["level"], step: string, message: string) =>
    logs.push({ offset: `+${clock.toString().padStart(4, "0")}ms`, level, step, message });

  const step = (id: string, name: string, latency: number, body: () => Omit<ProofStepResult, "id" | "name" | "simulatedLatencyMs">) => {
    if (state.failure) {
      steps.push({ id, name, status: "SKIPPED", detail: "Skipped after an earlier failure.", simulatedLatencyMs: 0 });
      log("INFO", id, `${name}: skipped`);
      return;
    }
    clock += latency;
    const r = body();
    steps.push({ id, name, simulatedLatencyMs: latency, ...r });
    log(r.status === "PASS" ? "INFO" : "ERROR", id, `${name}: ${r.status}${r.code ? ` (${r.code})` : ""} — ${r.detail}`);
  };

  log("INFO", "S0", `runner ${RUNNER_VERSION} test ${testCase} env ${env.envVersion} dataset ${env.dataset} [SIMULATED]`);
  const scopes = new Set(env.hubspot.grantedScopes);

  step("S1", "Connector manifest", 12, () => {
    if (env.hubspot.apiVersion !== "v3") {
      state.failure = {
        cls: "UNSUPPORTED_ENVIRONMENT",
        result: "INCONCLUSIVE",
        observed: `Simulator only models HubSpot CRM v3; requested ${env.hubspot.apiVersion}.`,
      };
      return { status: "FAIL", code: "UNSUPPORTED_API_VERSION", detail: `HubSpot ${env.hubspot.apiVersion} is not modelled (v3 only).` };
    }
    return { status: "PASS", detail: "Manifest targets simulated HubSpot CRM v3 objects API." };
  });

  step("S2", "OAuth scope check", 18, () => {
    const missing = ["contacts.read", "contacts.write"].filter((s) => !scopes.has(s));
    if (missing.length) {
      state.failure = {
        cls: "INSUFFICIENT_PERMISSION",
        result: "FAILED",
        observed: `PERMISSION_DENIED: simulated CRM returned 403 MISSING_SCOPES for ${missing.join(", ")}.`,
      };
      return {
        status: "FAIL",
        code: "PERMISSION_DENIED",
        detail: `403 MISSING_SCOPES requiredScopes=[${missing.join(", ")}] granted=[${[...scopes].join(", ")}]`,
      };
    }
    return { status: "PASS", detail: "Granted scopes include contacts.read and contacts.write." };
  });

  step("S3", "Dry-run contact update", 41, () => {
    if (!env.approvalWorkflow.enabled) {
      return {
        status: "PASS",
        code: "COMMITTED_IMMEDIATELY",
        detail: `PATCH /crm/v3/objects/contacts/${CONTACT} {lifecyclestage: opportunity} -> 200 committed without approval hold.`,
      };
    }
    return {
      status: "PASS",
      code: "HELD_FOR_APPROVAL",
      detail: `PATCH /crm/v3/objects/contacts/${CONTACT} {lifecyclestage: opportunity} -> 202 held as PENDING_APPROVAL.`,
    };
  });

  step("S4", "Human approval gate", 25, () => {
    if (!env.approvalWorkflow.enabled) {
      state.failure = {
        cls: "POLICY_VIOLATION",
        result: "FAILED",
        observed: "A production-style CRM write was committed without an approval event.",
      };
      return { status: "FAIL", code: "APPROVAL_BYPASSED", detail: "No approval event preceded the committed change." };
    }
    return { status: "PASS", detail: "Synthetic approver approver:ops-lead approved change CHG-0001; change committed." };
  });

  step("S5", "Audit trail", 9, () => ({
    status: "PASS",
    detail: `Audit entry links CHG-0001, approver:ops-lead and contact ${CONTACT}.`,
  }));

  const failure = state.failure;
  const result = failure ? failure.result : "PASSED";
  const failureClass = failure ? failure.cls : null;
  const observed = failure
    ? failure.observed
    : "Synthetic contact update committed only after an explicit approval event; audit entry verified.";
  log(result === "PASSED" ? "INFO" : "ERROR", "S9", `result ${result}${failureClass ? ` class ${failureClass}` : ""}`);

  const inputFixtureHash = fixtureHash(testCase, env);
  const evidence: ProofEvidence = {
    simulated: true,
    runnerVersion: RUNNER_VERSION,
    testCase,
    inputFixtureHash,
    environment: env,
    steps,
    logs,
    result,
    failureClass,
    observed,
  };
  const artifactDigest = evidenceDigest(evidence);
  return { evidence, artifactDigest, inputFixtureHash, reproduceCommand: reproduceCommandFor(testCase, env, artifactDigest) };
}

/** The two scripted demo environments from the brief. */
export const DEMO_ENVIRONMENTS: Record<"run_001" | "run_002", ProofEnvironment> = {
  run_001: {
    envVersion: "env-1",
    hubspot: { apiVersion: "v3", grantedScopes: ["contacts.read"] },
    approvalWorkflow: { enabled: false },
    dataset: "synthetic-contacts-v1",
  },
  run_002: {
    envVersion: "env-2",
    hubspot: { apiVersion: "v3", grantedScopes: ["contacts.read", "contacts.write"] },
    approvalWorkflow: { enabled: true },
    dataset: "synthetic-contacts-v1",
  },
};

export function fixtureKeyFor(env: ProofEnvironment): string {
  for (const [key, demo] of Object.entries(DEMO_ENVIRONMENTS)) {
    if (canonicalJson(demo) === canonicalJson(env)) return key;
  }
  return `custom-${sha256Canonical(env).slice(0, 8)}`;
}
