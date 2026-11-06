import { beforeAll, describe, expect, it } from "vitest";
import { runDemoScenario } from "@/lib/demo/scenario";
import { listOutcomes } from "@/lib/services/outcomes";
import { replayDecision } from "@/lib/services/replay";
import { actors, setupTestDb } from "../helpers/db";

describe("full demo storyline (fixture payments, offline evaluator)", () => {
  let result: Awaited<ReturnType<typeof runDemoScenario>>;

  beforeAll(async () => {
    await setupTestDb();
    result = await runDemoScenario();
  });

  it("flags NO_FIT for the unmodified scope and proposes a $49 proof", () => {
    expect(result.first.assessment.fitStatus).toBe("NO_FIT");
    expect(result.first.contract?.priceMinor).toBe(4900);
    expect(result.first.contract?.currency).toBe("USD");
  });

  it("run_001 fails on missing write scope; run_002 passes after the environment change", () => {
    expect(result.run1.run.fixtureKey).toBe("run_001");
    expect(result.run1.run.status).toBe("FAILED");
    expect(result.run1.outcome.failureClass).toBe("INSUFFICIENT_PERMISSION");
    expect(result.run2.run.fixtureKey).toBe("run_002");
    expect(result.run2.run.status).toBe("PASSED");
    expect(result.run2.outcome.result).toBe("PASS");
  });

  it("a similar request is now CONDITIONAL_FIT citing the outcome ids", () => {
    expect(result.second.assessment.fitStatus).toBe("CONDITIONAL_FIT");
    const citations = result.second.assessment.citationsJson as Array<{ kind: string; sourceId: string }>;
    const outcomeIds = citations.filter((c) => c.kind === "outcome").map((c) => c.sourceId);
    expect(outcomeIds).toContain(result.run2.outcome.id);
    expect(result.second.contract).toBeNull();
  });

  it("outcome memory shows the failure and the later pass", async () => {
    const { seller } = await actors();
    const rows = await listOutcomes(seller);
    expect(rows.map((r) => r.outcome.result).sort()).toEqual(["FAIL", "PASS"]);
  });

  it("decision replay changes NO_FIT → CONDITIONAL_FIT driven by the PASS outcome", async () => {
    const { seller } = await actors();
    const replay = await replayDecision(seller, result.first.request.id);
    expect(replay.diff.from).toBe("NO_FIT");
    expect(replay.diff.to).toBe("CONDITIONAL_FIT");
    expect(replay.diff.drivingOutcomeIds).toEqual([result.run2.outcome.id]);
    expect(replay.diff.reasonCodesAdded).toContain("REMEDIATION_VERIFIED_BY_OUTCOME");
  });
});
