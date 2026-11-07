import { describe, expect, it } from "vitest";
import { briefFromDraft, offlineProofDraft, overclaims, type ProofBriefDraft } from "@/lib/ai/proof-brief";
import { demoRequirement } from "@/lib/domain/requirements";
import type { PolicyResult } from "@/lib/policy/types";
import { runProof } from "@/lib/proofs/runner";
import { PROOF_CHECKS, TEST_CASE_CRM_UPDATE } from "@/lib/proofs/types";

const LIVE = { mode: "live" as const, label: "live", model: "claude-opus-5-5" };

function draft(partial: Partial<ProofBriefDraft> = {}): ProofBriefDraft {
  return {
    summary: "Checks whether a LINE message can update the matching HubSpot contact once write access and an approval step are in place.",
    answers: [
      { question: "Will updates fail today because the app can only read contacts?", check: "S2" },
      { question: "Does each change wait for your ops lead to approve it?", check: "S4" },
      { question: "Can you see who approved each change afterwards?", check: "S5" },
    ],
    not_covered: ["How the integration behaves at your real message volume."],
    ...partial,
  };
}

describe("proof brief", () => {
  it("names exactly the checks the simulated runner performs", () => {
    const env = {
      envVersion: "env-1",
      hubspot: { apiVersion: "v3", grantedScopes: ["contacts.read", "contacts.write"] },
      approvalWorkflow: { enabled: true },
      dataset: "synthetic-contacts-v1" as const,
    };
    const steps = runProof(TEST_CASE_CRM_UPDATE, env).evidence.steps.map((s) => [s.id, s.name]);
    expect(Object.fromEntries(steps)).toEqual(PROOF_CHECKS);
  });

  it("keeps a well-formed draft and attaches each check's name", () => {
    const b = briefFromDraft(draft(), LIVE)!;
    expect(b.answers.map((a) => [a.check, a.checkName])).toEqual([
      ["S2", "OAuth scope check"],
      ["S4", "Human approval gate"],
      ["S5", "Audit trail"],
    ]);
    expect(b.draftedBy).toEqual(LIVE);
  });

  it("allows one question per check and refuses a brief with fewer than two", () => {
    const twice = draft({
      answers: [
        { question: "Does the app hold the write permission it needs?", check: "S2" },
        { question: "Is the read permission enough for this flow?", check: "S2" },
      ],
    });
    expect(briefFromDraft(twice, LIVE)).toBeNull();
  });

  it("refuses over-claims: guarantees, or saying it tests the buyer's real account", () => {
    expect(briefFromDraft(draft({ summary: "This test guarantees your HubSpot sync will work in production." }), LIVE)).toBeNull();
    expect(
      briefFromDraft(
        draft({ answers: [...draft().answers, { question: "Does it update your real HubSpot account correctly?", check: "S3" }] }),
        LIVE,
      ),
    ).toBeNull();
  });

  it("keeps honest negations: saying the test is not the buyer's real account is not an over-claim", () => {
    for (const summary of [
      "Checks the update flow against a simulated HubSpot, not your real account, with an approval step in place.",
      "The test never touches your real HubSpot account; it runs on synthetic contacts only.",
      "There is no guarantee for other HubSpot versions, but the tested flow is checked end to end.",
      "It runs without your production CRM, on a simulated copy with the same permissions.",
    ]) {
      expect(briefFromDraft(draft({ summary }), LIVE), summary).not.toBeNull();
    }
  });

  it("still refuses over-claims that only look negated", () => {
    for (const summary of [
      "This test not only checks the permission but guarantees the sync will work in production.",
      "No setup is needed: the test runs on your real HubSpot account and updates it directly.",
      "The update is held for approval. It is certified to work with your live CRM.",
    ]) {
      expect(briefFromDraft(draft({ summary }), LIVE), summary).toBeNull();
    }
    expect(overclaims("It does not run on fixtures. It guarantees results.")).toBe(true);
  });

  it("the offline template only uses real checks", () => {
    const policy = { proposedProof: null, findings: [] } as unknown as PolicyResult;
    const d = offlineProofDraft({ requirement: demoRequirement("org_lumen"), policy });
    expect(d.answers.length).toBeGreaterThanOrEqual(2);
    for (const a of d.answers) expect(Object.keys(PROOF_CHECKS)).toContain(a.check);
  });
});
