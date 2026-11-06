import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { proofContracts } from "@/db/schema";
import type { AnthropicFactory } from "@/lib/ai/anthropic";
import type { ProofBrief } from "@/lib/ai/proof-brief";
import { withSystem } from "@/lib/db/client";
import { ORG } from "@/lib/demo/fixtures";
import { demoRequirement } from "@/lib/domain/requirements";
import { reassessRequest } from "@/lib/services/assessments";
import { createBuyerRequest } from "@/lib/services/requests";
import { actors, setupTestDb } from "../helpers/db";
import { OFFLINE } from "../helpers/flow";

const LIVE = { kind: "anthropic" as const, apiKey: "test-key-not-real", model: "claude-opus-5-5" };

const NARRATIVE = {
  explanation: "The requested scope cannot run unmodified. [S4]",
  confidence_reason: "Based on the cited policy.",
  questions_for_buyer: [],
  safe_alternatives: [],
  suggested_fit_status: "NO_FIT",
};

/** One fake client for both calls: the brief prompt is recognised by its system text. */
function fakeModel(brief: unknown, calls: string[]): AnthropicFactory {
  const parse = async (params: { system: string }) => {
    const isBrief = params.system.includes("buyer-facing brief");
    calls.push(isBrief ? "brief" : "narrative");
    if (isBrief && brief instanceof Error) throw brief;
    return { stop_reason: "end_turn", model: "claude-opus-5-5", parsed_output: isBrief ? brief : NARRATIVE };
  };
  return () => ({ beta: { messages: { parse } } }) as unknown as ReturnType<AnthropicFactory>;
}

const sealedBrief = async (contractId: string) => {
  const [c] = await withSystem((tx) => tx.select().from(proofContracts).where(eq(proofContracts.id, contractId)));
  return (c.immutableScopeJson as { proofBrief?: ProofBrief }).proofBrief;
};

describe("AI-drafted proof brief, sealed into the contract", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it("a live draft is sealed with the scope; the decision and price stay the policy's", async () => {
    const { buyer } = await actors();
    const calls: string[] = [];
    const brief = {
      summary: "Checks whether a LINE message can update the matching HubSpot contact once write access and an approval step exist.",
      answers: [
        { question: "Will updates fail today because the app can only read contacts?", check: "S2" },
        { question: "Does each change wait for your ops lead to approve it?", check: "S4" },
      ],
      not_covered: ["Behaviour at your real message volume."],
    };
    const r = await createBuyerRequest(buyer, demoRequirement(ORG.lumen), { aiMode: LIVE, anthropicFactory: fakeModel(brief, calls) });
    expect(r.assessment.fitStatus).toBe("NO_FIT");
    expect(r.contract?.priceMinor).toBe(4900);
    expect(calls.sort()).toEqual(["brief", "narrative"]);
    const sealed = await sealedBrief(r.contract!.id);
    expect(sealed?.draftedBy).toMatchObject({ mode: "live", model: "claude-opus-5-5" });
    expect(sealed?.answers.map((a) => a.checkName)).toEqual(["OAuth scope check", "Human approval gate"]);
  });

  it("an over-claiming or failing draft falls back to the labelled offline template", async () => {
    const { buyer } = await actors();
    const overclaim = {
      summary: "This test guarantees your integration will work.",
      answers: [
        { question: "Will it work?", check: "S2" },
        { question: "Will approvals hold?", check: "S4" },
      ],
      not_covered: [],
    };
    for (const brief of [overclaim, new Error("503 overloaded")]) {
      const r = await createBuyerRequest(buyer, demoRequirement(ORG.lumen), { aiMode: LIVE, anthropicFactory: fakeModel(brief, []) });
      const sealed = await sealedBrief(r.contract!.id);
      expect(sealed?.draftedBy.mode).toBe("offline");
      expect(sealed?.draftedBy.fallbackReason).toBeTruthy();
      expect(sealed?.answers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("without a key the offline template is used, and a re-run with an open contract drafts no brief", async () => {
    const { buyer, seller } = await actors();
    const r = await createBuyerRequest(buyer, demoRequirement(ORG.lumen), OFFLINE);
    expect((await sealedBrief(r.contract!.id))?.draftedBy.mode).toBe("offline");

    const calls: string[] = [];
    await reassessRequest(seller, r.request.id, { aiMode: LIVE, anthropicFactory: fakeModel(new Error("unused"), calls) });
    expect(calls).toEqual(["narrative"]);
  });
});
