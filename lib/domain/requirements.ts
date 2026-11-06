import { z } from "zod";

export const TOOL_KEYS = ["line", "hubspot", "google_sheets", "salesforce", "slack", "other"] as const;
export const ToolKey = z.enum(TOOL_KEYS);
export type ToolKey = z.infer<typeof ToolKey>;

export const TOOL_LABELS: Record<ToolKey, string> = {
  line: "LINE Messaging",
  hubspot: "HubSpot CRM",
  google_sheets: "Google Sheets",
  salesforce: "Salesforce",
  slack: "Slack",
  other: "Other / unlisted tool",
};

export const OPERATIONS = ["chat_receive", "chat_send", "crm_read", "crm_write", "sheet_read", "sheet_append"] as const;
export const Operation = z.enum(OPERATIONS);
export type Operation = z.infer<typeof Operation>;

export const OPERATION_LABELS: Record<Operation, string> = {
  chat_receive: "Receive chat messages",
  chat_send: "Send chat messages",
  crm_read: "Read CRM records",
  crm_write: "Create / update CRM records",
  sheet_read: "Read spreadsheet rows",
  sheet_append: "Append spreadsheet rows",
};

/** Simulated permission vocabulary shown to buyers (not real provider scope strings). */
export const TOOL_PERMISSIONS: Record<ToolKey, string[]> = {
  line: ["messaging.receive", "messaging.send"],
  hubspot: ["contacts.read", "contacts.write"],
  google_sheets: ["sheets.read", "sheets.write"],
  salesforce: ["api.read", "api.write"],
  slack: ["chat.read", "chat.write"],
  other: [],
};

export const ToolRequirement = z.object({
  key: ToolKey,
  apiVersion: z.string().trim().max(40).optional(),
  /** "stated": buyer listed the granted permissions; "unknown": buyer does not know. */
  permissionsStatus: z.enum(["stated", "unknown"]),
  grantedPermissions: z.array(z.string().trim().min(1).max(60)).max(20),
});
export type ToolRequirement = z.infer<typeof ToolRequirement>;

export const BuyerRequirementInput = z
  .object({
    sellerOrganizationId: z.string().trim().min(1).max(64),
    title: z.string().trim().min(5, "Title needs at least 5 characters").max(120),
    goal: z.string().trim().min(20, "Describe the goal in at least 20 characters").max(2000),
    budgetMinor: z.number().int().min(0).max(100_000_000),
    currency: z.literal("USD"),
    timelineDays: z.number().int().min(1).max(365),
    tools: z.array(ToolRequirement).min(1, "Select at least one tool").max(6),
    operations: z.array(Operation).min(1, "Select at least one operation").max(OPERATIONS.length),
    compliance: z.object({
      dataResidency: z.enum(["none", "us", "eu", "jp"]),
      approvalMode: z.enum(["fully_automatic", "human_in_loop", "undecided"]),
      containsPii: z.boolean(),
    }),
    notes: z.string().max(2000).default(""),
  })
  .superRefine((value, ctx) => {
    const keys = value.tools.map((t) => t.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", path: ["tools"], message: "Each tool can only be listed once" });
    }
    if (new Set(value.operations).size !== value.operations.length) {
      ctx.addIssue({ code: "custom", path: ["operations"], message: "Duplicate operation" });
    }
  });
export type BuyerRequirementInput = z.input<typeof BuyerRequirementInput>;
export type BuyerRequirement = z.output<typeof BuyerRequirementInput>;

export function operationTool(op: Operation): ToolKey | "crm" {
  if (op === "chat_receive" || op === "chat_send") return "line";
  if (op === "sheet_read" || op === "sheet_append") return "google_sheets";
  return "crm";
}

/** The fictional demo scenario from the product brief (all data synthetic). */
export function demoRequirement(sellerOrganizationId: string): BuyerRequirement {
  return {
    sellerOrganizationId,
    title: "LINE → HubSpot → Google Sheets lead sync",
    goal: "When a customer messages our LINE official account, automatically update the matching HubSpot contact (lifecycle stage + last message) and append a row to our weekly Google Sheets report. We want this fully automatic.",
    budgetMinor: 300_000,
    currency: "USD",
    timelineDays: 21,
    tools: [
      { key: "line", permissionsStatus: "stated", grantedPermissions: ["messaging.receive"] },
      { key: "hubspot", apiVersion: "v3", permissionsStatus: "stated", grantedPermissions: ["contacts.read"] },
      { key: "google_sheets", apiVersion: "v4", permissionsStatus: "stated", grantedPermissions: ["sheets.write"] },
    ],
    operations: ["chat_receive", "crm_read", "crm_write", "sheet_append"],
    compliance: { dataResidency: "none", approvalMode: "fully_automatic", containsPii: true },
    notes: "Fictional demo buyer. Budget USD 3,000 (demo price).",
  };
}

/** The same fictional scenario as a buyer would write it, for the plain-language intake. */
export const DEMO_REQUEST_TEXT =
  "Hi Lumen team. When a customer messages our LINE official account, we want the matching HubSpot contact updated automatically (lifecycle stage and last message), and a row appended to our weekly Google Sheets report. It should be fully automatic, with no manual steps. Our LINE channel has messaging.receive. Our HubSpot private app uses API v3 and currently holds contacts.read only. The Google Sheets connection uses API v4 and has sheets.write. The messages include customer names and phone numbers. Budget is about $3,000 and we'd like it live within 3 weeks.";
