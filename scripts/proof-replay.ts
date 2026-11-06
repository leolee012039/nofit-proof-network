/**
 * Re-derives a proof run's evidence digest from its inputs, offline.
 *   npm run proof:replay -- --fixture run_001
 *   npm run proof:replay -- --test-case TC-CRM-UPDATE-APPROVAL-01 --env-b64 <base64url env> [--expect <sha256>]
 */
import { DEMO_ENVIRONMENTS, runProof } from "../lib/proofs/runner";
import { ProofEnvironment, TEST_CASE_CRM_UPDATE } from "../lib/proofs/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fixture = arg("fixture");
const testCase = arg("test-case") ?? TEST_CASE_CRM_UPDATE;
let env: ProofEnvironment;
if (fixture) {
  const e = DEMO_ENVIRONMENTS[fixture as keyof typeof DEMO_ENVIRONMENTS];
  if (!e) {
    console.error(`Unknown fixture ${fixture}. Known: ${Object.keys(DEMO_ENVIRONMENTS).join(", ")}`);
    process.exit(2);
  }
  env = e;
} else {
  const b64 = arg("env-b64");
  if (!b64) {
    console.error("Pass --fixture <name> or --env-b64 <base64url canonical environment>.");
    process.exit(2);
  }
  env = ProofEnvironment.parse(JSON.parse(Buffer.from(b64, "base64url").toString("utf8")));
}

const exec = runProof(testCase, env);
console.log(`test case        ${testCase}  [SIMULATED]`);
console.log(`environment      ${JSON.stringify(env)}`);
console.log(`input fixture    ${exec.inputFixtureHash}`);
for (const l of exec.evidence.logs) console.log(`  ${l.offset} ${l.level.padEnd(5)} ${l.step} ${l.message}`);
console.log(`result           ${exec.evidence.result}${exec.evidence.failureClass ? ` (${exec.evidence.failureClass})` : ""}`);
console.log(`artifact digest  ${exec.artifactDigest}`);
const expect = arg("expect");
if (expect) {
  const ok = expect === exec.artifactDigest;
  console.log(ok ? "MATCH: stored digest reproduced exactly." : `MISMATCH: expected ${expect}`);
  process.exit(ok ? 0 : 1);
}
