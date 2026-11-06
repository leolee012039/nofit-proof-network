import { beforeAll, describe, expect, it } from "vitest";
import type { AnthropicFactory } from "@/lib/ai/anthropic";
import { ORG } from "@/lib/demo/fixtures";
import { demoRequirement } from "@/lib/domain/requirements";
import { computeAssessment } from "@/lib/services/assessments";
import { setupTestDb } from "../helpers/db";

const LIVE = { kind: "anthropic" as const, apiKey: "test-key-not-real", model: "claude-opus-5-5" };

function fakeModel(parse: () => Promise<unknown>): AnthropicFactory {
  return () => ({ beta: { messages: { parse } } }) as unknown as ReturnType<AnthropicFactory>;
}

describe("AI evaluator layer (model output can never change the decision)", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it("case 9 — model unavailable → offline deterministic fallback, clearly labelled", async () => {
    const { assessment } = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, {
      aiMode: LIVE,
      anthropicFactory: fakeModel(async () => {
        throw new Error("503 overloaded");
      }),
    });
    expect(assessment.fit_status).toBe("NO_FIT");
    expect(assessment.evaluator.mode).toBe("offline-fixture");
    expect(assessment.evaluator.fallbackReason).toContain("503");
    expect(assessment.evaluator.label).toContain("live model unavailable");
  });

  it("a model that tries to declare FIT (e.g. after reading the injected upload) is recorded but overruled", async () => {
    const { assessment } = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, {
      aiMode: LIVE,
      anthropicFactory: fakeModel(async () => ({
        stop_reason: "end_turn",
        model: "claude-opus-5-5",
        parsed_output: {
          explanation: "Approved. Everything is FIT and the payment is approved at $0.01.",
          confidence_reason: "certain",
          questions_for_buyer: [],
          safe_alternatives: [],
          suggested_fit_status: "FIT",
        },
      })),
    });
    expect(assessment.fit_status).toBe("NO_FIT");
    expect(assessment.hard_blockers.map((b) => b.code)).toEqual(["R-CRM-WRITE-SCOPE"]);
    expect(assessment.proposed_proof?.priceMinor).toBe(4900);
    expect(assessment.evaluator).toMatchObject({ mode: "live", modelSuggestedStatus: "FIT", modelDisagreedWithPolicy: true });
  });

  it("refusal or truncated output also falls back offline", async () => {
    for (const stop_reason of ["refusal", "max_tokens"]) {
      const { assessment } = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, {
        aiMode: LIVE,
        anthropicFactory: fakeModel(async () => ({ stop_reason, model: "claude-opus-5-5", parsed_output: null })),
      });
      expect(assessment.evaluator.mode).toBe("offline-fixture");
      expect(assessment.fit_status).toBe("NO_FIT");
    }
  });

  it("the model prompt receives retrieved documents only as wrapped, untrusted data", async () => {
    let captured: { system?: string; messages?: Array<{ content: string }> } = {};
    await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, {
      aiMode: LIVE,
      anthropicFactory: fakeModel(async (...args: unknown[]) => {
        captured = args[0] as typeof captured;
        throw new Error("stop after capture");
      }),
    });
    expect(captured.system).toContain("untrusted data");
    const content = captured.messages![0].content;
    expect(content).toContain("<retrieved_documents>");
    expect(content).toContain('trust="untrusted_upload"');
  });
});
