import { beforeAll, describe, expect, it } from "vitest";
import type { AnthropicFactory } from "@/lib/ai/anthropic";
import { LIVE_MODEL_LIMIT_REASON, resetLiveModelBudget } from "@/lib/ai/budget";
import type { IntakeDraft } from "@/lib/ai/intake";
import { ORG } from "@/lib/demo/fixtures";
import { DEMO_REQUEST_TEXT, demoRequirement } from "@/lib/domain/requirements";
import { computeAssessment } from "@/lib/services/assessments";
import { draftIntake } from "@/lib/services/intake";
import { createBuyerRequest } from "@/lib/services/requests";
import { actors, setupTestDb } from "../helpers/db";
import { OFFLINE } from "../helpers/flow";

const LIVE = { kind: "anthropic" as const, apiKey: "test-key-not-real", model: "claude-opus-5-5" };

function fakeModel(parse: () => Promise<unknown>): AnthropicFactory {
  return () => ({ beta: { messages: { parse } } }) as unknown as ReturnType<AnthropicFactory>;
}

function asRequirement(d: IntakeDraft) {
  return {
    sellerOrganizationId: ORG.lumen,
    title: d.title,
    goal: d.goal,
    budgetMinor: Math.round((d.budgetUsd ?? 0) * 100),
    currency: "USD" as const,
    timelineDays: d.timelineDays ?? 30,
    tools: d.tools,
    operations: d.operations,
    compliance: d.compliance,
    notes: "",
  };
}

describe("intake draft service", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it("only a buyer can draft, and the text must be a real description", async () => {
    const { buyer, seller } = await actors();
    await expect(draftIntake(seller, { text: DEMO_REQUEST_TEXT }, OFFLINE)).rejects.toThrow(/requires role buyer/);
    await expect(draftIntake(buyer, { text: "too short" }, OFFLINE)).rejects.toThrow(/at least 40/);
    await expect(draftIntake(buyer, { text: "x".repeat(4001) }, OFFLINE)).rejects.toThrow(/under 4,000/);
    await expect(draftIntake(buyer, { text: 42 }, OFFLINE)).rejects.toThrow(/plain text/);
  });

  it("the drafted sample request flows through the policy to NO_FIT and the $49 proof", async () => {
    const { buyer } = await actors();
    const d = await draftIntake(buyer, { text: DEMO_REQUEST_TEXT }, OFFLINE);
    expect(d.extractor.mode).toBe("offline");
    const r = await createBuyerRequest(buyer, asRequirement(d), OFFLINE);
    expect(r.assessment.fitStatus).toBe("NO_FIT");
    expect(r.contract?.priceMinor).toBe(4900);
  });

  it("a live model's draft is labelled with the model and still guarded against invented claims", async () => {
    const { buyer } = await actors();
    const d = await draftIntake(
      buyer,
      { text: DEMO_REQUEST_TEXT },
      {
        aiMode: LIVE,
        anthropicFactory: fakeModel(async () => ({
          stop_reason: "end_turn",
          model: "claude-opus-5-5",
          parsed_output: {
            title: "LINE to HubSpot sync",
            goal: "Update HubSpot contacts from LINE messages and report them weekly in Google Sheets.",
            budget_usd: 3000,
            timeline_days: 21,
            tools: [
              {
                key: "hubspot",
                api_version: "3",
                permissions_status: "stated",
                // The model over-reaches: the buyer only holds contacts.read.
                granted_permissions: ["contacts.read", "contacts.write"],
                evidence_quote: "holds contacts.read and contacts.write",
              },
            ],
            operations: [],
            approval_mode: "fully_automatic",
            approval_quote: "It should be fully automatic, with no manual steps.",
            data_residency: "none",
            contains_pii: true,
            open_questions: ["Which HubSpot lifecycle stages should be set?"],
          },
        })),
      },
    );
    expect(d.extractor).toMatchObject({ mode: "live", model: "claude-opus-5-5" });
    expect(d.tools).toEqual([]);
    expect(d.checks).toEqual(expect.arrayContaining(["Which HubSpot lifecycle stages should be set?"]));
  });

  it("model failure, refusal or truncation falls back to the labelled offline extractor", async () => {
    const { buyer } = await actors();
    const failures: Array<() => Promise<unknown>> = [
      async () => {
        throw new Error("503 overloaded");
      },
      async () => ({ stop_reason: "refusal", model: "claude-opus-5-5", parsed_output: null }),
      async () => ({ stop_reason: "max_tokens", model: "claude-opus-5-5", parsed_output: null }),
    ];
    for (const parse of failures) {
      const d = await draftIntake(buyer, { text: DEMO_REQUEST_TEXT }, { aiMode: LIVE, anthropicFactory: fakeModel(parse) });
      expect(d.extractor.mode).toBe("offline");
      expect(d.extractor.label).toContain("live model unavailable");
      expect(d.extractor.fallbackReason).toBeTruthy();
      expect(d.tools.map((t) => t.key)).toEqual(["line", "hubspot", "google_sheets"]);
    }
  });

  it("over the live-call limit, the draft and the assessment stay offline instead of calling the model", async () => {
    const { buyer } = await actors();
    const previous = process.env.AI_LIVE_CALLS_PER_HOUR;
    process.env.AI_LIVE_CALLS_PER_HOUR = "1";
    resetLiveModelBudget();
    let calls = 0;
    const model = fakeModel(async () => {
      calls += 1;
      throw new Error("503 overloaded");
    });
    try {
      await draftIntake(buyer, { text: DEMO_REQUEST_TEXT }, { aiMode: LIVE, anthropicFactory: model });
      const capped = await draftIntake(buyer, { text: DEMO_REQUEST_TEXT }, { aiMode: LIVE, anthropicFactory: model });
      const { assessment } = await computeAssessment(demoRequirement(ORG.lumen), ORG.lumen, { aiMode: LIVE, anthropicFactory: model });
      expect(calls).toBe(1);
      expect(capped.extractor.fallbackReason).toBe(LIVE_MODEL_LIMIT_REASON);
      expect(assessment.evaluator.fallbackReason).toBe(LIVE_MODEL_LIMIT_REASON);
      expect(assessment.fit_status).toBe("NO_FIT");
    } finally {
      if (previous === undefined) delete process.env.AI_LIVE_CALLS_PER_HOUR;
      else process.env.AI_LIVE_CALLS_PER_HOUR = previous;
      resetLiveModelBudget();
    }
  });
});
