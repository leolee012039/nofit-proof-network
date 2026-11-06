import { describe, expect, it } from "vitest";
import { resetLiveModelBudget, takeLiveModelCall } from "@/lib/ai/budget";
import { draftFromExtraction, isQuoteOf, offlineIntakeExtraction, type IntakeExtraction } from "@/lib/ai/intake";
import { DEMO_REQUEST_TEXT, demoRequirement } from "@/lib/domain/requirements";

const OFFLINE = { mode: "offline" as const, label: "offline" };
const LIVE = { mode: "live" as const, label: "live", model: "claude-opus-5-5" };

/** A model answer for the demo text, as a well-behaved model would give it. */
function modelAnswer(partial: Partial<IntakeExtraction> = {}): IntakeExtraction {
  return {
    title: "LINE to HubSpot lead sync",
    goal: "Update the matching HubSpot contact from LINE messages and log each one to a weekly Google Sheets report.",
    budget_usd: 3000,
    timeline_days: 21,
    tools: [
      {
        key: "hubspot",
        api_version: "v3",
        permissions_status: "stated",
        granted_permissions: ["contacts.read"],
        evidence_quote: "Our HubSpot private app uses API v3 and currently holds contacts.read only.",
      },
    ],
    operations: [{ operation: "crm_write", evidence_quote: "we want the matching HubSpot contact updated automatically" }],
    approval_mode: "fully_automatic",
    approval_quote: "It should be fully automatic, with no manual steps.",
    data_residency: "none",
    contains_pii: true,
    open_questions: [],
    ...partial,
  };
}

describe("plain-language intake", () => {
  it("the offline extractor turns the sample request into the demo scenario's form", () => {
    const d = draftFromExtraction(offlineIntakeExtraction(DEMO_REQUEST_TEXT), DEMO_REQUEST_TEXT, OFFLINE);
    const demo = demoRequirement("org_lumen");
    expect(d.tools).toEqual(demo.tools);
    expect([...d.operations].sort()).toEqual([...demo.operations].sort());
    expect(d.compliance).toEqual(demo.compliance);
    expect(d.budgetUsd).toBe(3000);
    expect(d.timelineDays).toBe(21);
    expect(d.title).toBe("LINE → HubSpot → Google Sheets automation");
    expect(d.checks).toEqual([]);
    expect(d.evidence.find((e) => e.field === "HubSpot CRM")?.quote).toContain("contacts.read only");
  });

  it("never assumes permissions: a tool named without its access is marked 'not sure'", () => {
    const text = "When a lead messages our LINE account, create a contact in Salesforce. Budget $2,000 within two weeks.";
    const d = draftFromExtraction(offlineIntakeExtraction(text), text, OFFLINE);
    expect(d.tools.map((t) => [t.key, t.permissionsStatus, t.grantedPermissions])).toEqual([
      ["line", "unknown", []],
      ["salesforce", "unknown", []],
    ]);
    expect(d.timelineDays).toBe(14);
    expect(d.checks.some((c) => c.includes("Salesforce permissions"))).toBe(true);
  });

  it("keeps only claims backed by a real quote from the buyer's text", () => {
    const d = draftFromExtraction(
      modelAnswer({
        tools: [
          ...modelAnswer().tools,
          // Invented: the buyer never mentioned Slack.
          {
            key: "slack",
            api_version: null,
            permissions_status: "stated",
            granted_permissions: ["chat.write"],
            evidence_quote: "post to our Slack",
          },
        ],
        operations: [...modelAnswer().operations, { operation: "chat_send", evidence_quote: "reply to the customer on LINE" }],
      }),
      DEMO_REQUEST_TEXT,
      LIVE,
    );
    expect(d.tools.map((t) => t.key)).toEqual(["hubspot"]);
    expect(d.operations).toEqual(["crm_write"]);
    expect(d.checks.some((c) => c.includes("Slack"))).toBe(true);
    expect(d.checks.some((c) => c.includes("Send chat messages"))).toBe(true);
  });

  it("drops permission names outside the vocabulary and an approval choice without a quote", () => {
    const d = draftFromExtraction(
      modelAnswer({
        tools: [{ ...modelAnswer().tools[0], granted_permissions: ["contacts.read", "admin.everything"] }],
        approval_mode: "human_in_loop",
        approval_quote: "a manager approves each change",
      }),
      DEMO_REQUEST_TEXT,
      LIVE,
    );
    expect(d.tools[0].grantedPermissions).toEqual(["contacts.read"]);
    expect(d.compliance.approvalMode).toBe("undecided");
    expect(d.checks.some((c) => c.includes("person's approval"))).toBe(true);
  });

  it("asks for a budget and a timeline instead of guessing them", () => {
    const d = draftFromExtraction(modelAnswer({ budget_usd: null, timeline_days: 900 }), DEMO_REQUEST_TEXT, LIVE);
    expect(d.budgetUsd).toBeNull();
    expect(d.timelineDays).toBeNull();
    expect(d.checks).toEqual(expect.arrayContaining(["Add a budget.", "Add a timeline in days."]));
  });

  it("quote matching ignores case, spacing and typographic quotes, but not invented words", () => {
    expect(isQuoteOf("We'd like it   live within 3 weeks.", "we’d like it live")).toBe(true);
    expect(isQuoteOf(DEMO_REQUEST_TEXT, "holds contacts.write")).toBe(false);
    expect(isQuoteOf(DEMO_REQUEST_TEXT, "Hi")).toBe(false);
  });
});

describe("live model call budget", () => {
  it("allows the hourly limit, refuses beyond it, and refills after an hour (the daily limit still applies)", () => {
    resetLiveModelBudget();
    const env = { AI_LIVE_CALLS_PER_HOUR: "2", AI_LIVE_CALLS_PER_DAY: "3" } as unknown as NodeJS.ProcessEnv;
    const t0 = Date.UTC(2026, 10, 4, 9);
    expect([takeLiveModelCall(t0, env), takeLiveModelCall(t0, env), takeLiveModelCall(t0, env)]).toEqual([true, true, false]);
    const nextHour = t0 + 60 * 60 * 1000;
    expect([takeLiveModelCall(nextHour, env), takeLiveModelCall(nextHour, env)]).toEqual([true, false]);
    resetLiveModelBudget();
  });
});
