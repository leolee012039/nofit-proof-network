"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { btn, cx, input } from "@/components/ui";
import type { IntakeDraft } from "@/lib/ai/intake";
import {
  BuyerRequirementInput,
  DEMO_REQUEST_TEXT,
  OPERATIONS,
  OPERATION_LABELS,
  TOOL_KEYS,
  TOOL_LABELS,
  TOOL_PERMISSIONS,
  demoRequirement,
  type BuyerRequirement,
  type Operation,
  type ToolKey,
  type ToolRequirement,
} from "@/lib/domain/requirements";
import { postJson } from "./api";

interface ToolState {
  selected: boolean;
  apiVersion: string;
  permissionsStatus: "stated" | "unknown";
  granted: string[];
}

type Residency = "none" | "us" | "eu" | "jp";
type Approval = "fully_automatic" | "human_in_loop" | "undecided";

/** Validation path → the control that receives focus, in on-screen order. */
const FOCUS_ORDER: ReadonlyArray<readonly [string, string]> = [
  ["title", "title"],
  ["goal", "goal"],
  ["budgetMinor", "budget"],
  ["timelineDays", "timeline"],
  ["tools", `tool-${TOOL_KEYS[0]}`],
  ["operations", `op-${OPERATIONS[0]}`],
];

function emptyTools(): Record<ToolKey, ToolState> {
  return Object.fromEntries(
    TOOL_KEYS.map((k) => [k, { selected: false, apiVersion: "", permissionsStatus: "stated", granted: [] }]),
  ) as unknown as Record<ToolKey, ToolState>;
}

export function IntakeForm({
  sellers,
  demoSellerId,
}: {
  sellers: Array<{ id: string; name: string; description: string }>;
  demoSellerId: string;
}) {
  const router = useRouter();
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [tools, setTools] = useState(emptyTools);
  const [ops, setOps] = useState<Operation[]>([]);
  const [residency, setResidency] = useState<Residency>("none");
  const [approval, setApproval] = useState<Approval>("undecided");
  const [pii, setPii] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [describe, setDescribe] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<IntakeDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const draft = useMemo(
    () => ({
      sellerOrganizationId: sellerId,
      title,
      goal,
      budgetMinor: Math.round(Number(budget || "0") * 100),
      currency: "USD" as const,
      timelineDays: Number(timeline || "0"),
      tools: TOOL_KEYS.filter((k) => tools[k].selected).map((k) => ({
        key: k,
        ...(tools[k].apiVersion.trim() ? { apiVersion: tools[k].apiVersion.trim() } : {}),
        permissionsStatus: tools[k].permissionsStatus,
        grantedPermissions: tools[k].permissionsStatus === "stated" ? tools[k].granted : [],
      })),
      operations: ops,
      compliance: { dataResidency: residency, approvalMode: approval, containsPii: pii },
      notes,
    }),
    [sellerId, title, goal, budget, timeline, tools, ops, residency, approval, pii, notes],
  );

  const validation = BuyerRequirementInput.safeParse(draft);
  const issues = validation.success ? [] : validation.error.issues;
  const issueFor = (path: string) => (submitted ? issues.find((i) => i.path.join(".").startsWith(path))?.message : undefined);
  /** Links a control to its error text so screen readers announce it with the field. */
  const errorProps = (id: string, path: string) =>
    issueFor(path) ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
  /** Groups (fieldsets) carry only the description; aria-invalid belongs on form controls. */
  const groupErrorProps = (id: string, path: string) => (issueFor(path) ? { "aria-describedby": `${id}-error` } : {});

  function fill(d: {
    title: string;
    goal: string;
    budget: string;
    timeline: string;
    tools: ToolRequirement[];
    operations: Operation[];
    compliance: BuyerRequirement["compliance"];
  }) {
    setTitle(d.title);
    setGoal(d.goal);
    setBudget(d.budget);
    setTimeline(d.timeline);
    const t = emptyTools();
    for (const tool of d.tools) {
      t[tool.key] = {
        selected: true,
        apiVersion: tool.apiVersion ?? "",
        permissionsStatus: tool.permissionsStatus,
        granted: tool.grantedPermissions,
      };
    }
    setTools(t);
    setOps(d.operations);
    setResidency(d.compliance.dataResidency);
    setApproval(d.compliance.approvalMode);
    setPii(d.compliance.containsPii);
  }

  function loadDemo() {
    const d = demoRequirement(demoSellerId);
    setSellerId(demoSellerId);
    fill({ ...d, budget: String(d.budgetMinor / 100), timeline: String(d.timelineDays) });
    setNotes(d.notes);
    setAiDraft(null);
  }

  async function draftWithAi() {
    setDraftError(null);
    if (describe.trim().length < 40) {
      setDraftError("Write at least 40 characters: which tools, what should happen, and what access you have.");
      return;
    }
    setDrafting(true);
    try {
      const { draft: d } = await postJson<{ draft: IntakeDraft }>("/api/intake/draft", { text: describe });
      fill({
        ...d,
        budget: d.budgetUsd === null ? "" : String(d.budgetUsd),
        timeline: d.timelineDays === null ? "" : String(d.timelineDays),
      });
      setAiDraft(d);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Drafting failed. Fill in the form below instead.");
    } finally {
      setDrafting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (!validation.success) {
      // Move focus to the first field that needs attention instead of leaving the user at the submit button.
      const first = FOCUS_ORDER.find(([path]) => issues.some((i) => i.path.join(".").startsWith(path)));
      if (first) document.getElementById(first[1])?.focus();
      return;
    }
    setPending(true);
    try {
      const res = await postJson<{ requestId: string }>("/api/requests", validation.data);
      router.push(`/requests/${res.requestId}`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Submission failed");
      setPending(false);
    }
  }

  const fieldError = (id: string, msg?: string) =>
    msg ? (
      <p id={`${id}-error`} className="mt-1 text-sm text-red">
        {msg}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section aria-labelledby="describe-heading" className="rounded-[3px] border border-steel bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="describe-heading" className="text-[16px] font-semibold">
              Describe it in your own words
            </h2>
            <button
              type="button"
              onClick={() => setDescribe(DEMO_REQUEST_TEXT)}
              className="rounded-[2px] text-sm font-semibold text-ink underline underline-offset-4"
              data-testid="use-sample-text"
            >
              Use the sample request
            </button>
          </div>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-2">
            Paste an email or a few sentences. AI drafts the form below and shows the words it used for each field. You check the draft; the
            deterministic policy makes the decision.
          </p>
          <label htmlFor="describe" className="sr-only">
            Your request in plain English
          </label>
          <textarea
            id="describe"
            rows={5}
            maxLength={4000}
            className={cx(input, "mt-3")}
            value={describe}
            onChange={(e) => setDescribe(e.target.value)}
            placeholder="e.g. When a customer messages our LINE account, update their HubSpot contact automatically…"
            {...(draftError ? { "aria-invalid": true as const, "aria-describedby": "describe-error" } : {})}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={draftWithAi} className={btn.marker} disabled={drafting} data-testid="draft-with-ai">
              {drafting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              {drafting ? "Drafting…" : "Draft the form with AI"}
            </button>
            <button type="button" onClick={loadDemo} className={btn.ghost} data-testid="load-demo">
              Skip: load the demo form
            </button>
          </div>
          {draftError ? (
            <p id="describe-error" role="alert" className="mt-2 text-sm text-red">
              {draftError}
            </p>
          ) : null}
          {aiDraft ? <DraftReview draft={aiDraft} /> : null}
        </section>

        <fieldset className="space-y-4 rounded-[3px] border border-steel bg-surface p-5">
          <legend className="px-1 text-sm font-semibold">Project</legend>
          <div>
            <label htmlFor="seller" className="text-sm font-medium">
              Seller
            </label>
            <select id="seller" className={cx(input, "mt-1")} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (fictional)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              className={cx(input, "mt-1")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. LINE → HubSpot lead sync"
              {...errorProps("title", "title")}
            />
            {fieldError("title", issueFor("title"))}
          </div>
          <div>
            <label htmlFor="goal" className="text-sm font-medium">
              Goal
            </label>
            <textarea
              id="goal"
              rows={4}
              className={cx(input, "mt-1")}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should happen, in business terms?"
              {...errorProps("goal", "goal")}
            />
            {fieldError("goal", issueFor("goal"))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="budget" className="text-sm font-medium">
                Budget (USD)
              </label>
              <input
                id="budget"
                inputMode="decimal"
                className={cx(input, "mt-1 tabular")}
                value={budget}
                onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="3000"
                {...errorProps("budget", "budgetMinor")}
              />
              {fieldError("budget", issueFor("budgetMinor"))}
            </div>
            <div>
              <label htmlFor="timeline" className="text-sm font-medium">
                Timeline (days)
              </label>
              <input
                id="timeline"
                inputMode="numeric"
                className={cx(input, "mt-1 tabular")}
                value={timeline}
                onChange={(e) => setTimeline(e.target.value.replace(/\D/g, ""))}
                placeholder="21"
                {...errorProps("timeline", "timelineDays")}
              />
              {fieldError("timeline", issueFor("timelineDays"))}
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-[3px] border border-steel bg-surface p-5" {...groupErrorProps("tools", "tools")}>
          <legend className="px-1 text-sm font-semibold">Tools and granted permissions</legend>
          <p className="text-sm text-ink-3">
            Permissions are never assumed. If you are not sure what the integration holds, say so — the assessment will mark it as missing
            information.
          </p>
          {fieldError("tools", issueFor("tools"))}
          {TOOL_KEYS.map((k) => {
            const t = tools[k];
            const set = (patch: Partial<ToolState>) => setTools((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
            return (
              <div key={k} className={cx("rounded-[3px] border px-4 py-3", t.selected ? "border-steel-2 bg-paper" : "border-steel")}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input id={`tool-${k}`} type="checkbox" checked={t.selected} onChange={(e) => set({ selected: e.target.checked })} />
                  {TOOL_LABELS[k]}
                </label>
                {t.selected && k !== "other" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
                    <div>
                      <label htmlFor={`ver-${k}`} className="text-xs text-ink-3">
                        API version (optional)
                      </label>
                      <input
                        id={`ver-${k}`}
                        className={cx(input, "mt-1")}
                        value={t.apiVersion}
                        onChange={(e) => set({ apiVersion: e.target.value })}
                        placeholder="e.g. v3"
                      />
                    </div>
                    <fieldset>
                      <legend className="text-xs text-ink-3">Granted permissions</legend>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`ps-${k}`}
                            checked={t.permissionsStatus === "stated"}
                            onChange={() => set({ permissionsStatus: "stated" })}
                          />{" "}
                          I know them
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`ps-${k}`}
                            checked={t.permissionsStatus === "unknown"}
                            onChange={() => set({ permissionsStatus: "unknown", granted: [] })}
                          />{" "}
                          Not sure
                        </label>
                      </div>
                      {t.permissionsStatus === "stated" ? (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                          {TOOL_PERMISSIONS[k].map((p) => (
                            <label key={p} className="flex items-center gap-1.5 font-mono text-[12px]">
                              <input
                                type="checkbox"
                                checked={t.granted.includes(p)}
                                onChange={(e) => set({ granted: e.target.checked ? [...t.granted, p] : t.granted.filter((x) => x !== p) })}
                              />
                              {p}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </fieldset>
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs text-ink-3">Permission names are a simplified, simulated vocabulary — not real provider scope strings.</p>
        </fieldset>

        <fieldset className="space-y-3 rounded-[3px] border border-steel bg-surface p-5" {...groupErrorProps("operations", "operations")}>
          <legend className="px-1 text-sm font-semibold">What should the automation do?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPERATIONS.map((op) => (
              <label key={op} className="flex items-center gap-2 text-sm">
                <input
                  id={`op-${op}`}
                  type="checkbox"
                  checked={ops.includes(op)}
                  onChange={(e) => setOps(e.target.checked ? [...ops, op] : ops.filter((x) => x !== op))}
                />
                {OPERATION_LABELS[op]}
              </label>
            ))}
          </div>
          {fieldError("operations", issueFor("operations"))}
        </fieldset>

        <fieldset className="space-y-4 rounded-[3px] border border-steel bg-surface p-5">
          <legend className="px-1 text-sm font-semibold">Compliance limits</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="residency" className="text-sm font-medium">
                Data residency
              </label>
              <select
                id="residency"
                className={cx(input, "mt-1")}
                value={residency}
                onChange={(e) => setResidency(e.target.value as Residency)}
              >
                <option value="none">No requirement</option>
                <option value="us">US only</option>
                <option value="eu">EU only</option>
                <option value="jp">Japan only</option>
              </select>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">CRM changes</legend>
              <div className="mt-1 space-y-1 text-sm">
                {(
                  [
                    ["fully_automatic", "Fully automatic"],
                    ["human_in_loop", "Human approves changes"],
                    ["undecided", "Not decided"],
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="radio" name="approval" checked={approval === v} onChange={() => setApproval(v)} /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pii} onChange={(e) => setPii(e.target.checked)} /> The data includes personal information
          </label>
          <div>
            <label htmlFor="notes" className="text-sm font-medium">
              Notes (treated as data, never as instructions)
            </label>
            <textarea id="notes" rows={2} className={cx(input, "mt-1")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </fieldset>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <div className="rounded-[3px] border border-steel bg-surface">
          <div className="border-b border-steel px-5 py-4">
            <h2 className="text-[16px] font-semibold">What will be assessed</h2>
            <p className="mt-0.5 text-[14px] text-ink-3">Live preview of your draft</p>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm">
            <p className="font-medium">{title || <span className="text-ink-3">Untitled request</span>}</p>
            <p className="text-ink-2">
              Budget <span className="tabular">{budget ? `USD ${Number(budget).toLocaleString("en-US")}` : "—"}</span> · Timeline{" "}
              {timeline || "—"} days
            </p>
            <ul className="space-y-1">
              {draft.tools.length === 0 ? <li className="text-ink-3">No tools selected</li> : null}
              {draft.tools.map((t) => (
                <li key={t.key} className="font-mono text-[12px] text-ink-2">
                  {t.key}
                  {t.apiVersion ? `@${t.apiVersion}` : ""} ·{" "}
                  {t.permissionsStatus === "unknown" ? "permissions unknown" : `[${t.grantedPermissions.join(", ") || "none"}]`}
                </li>
              ))}
            </ul>
            <p className="font-mono text-[12px] text-ink-2">ops: {ops.join(", ") || "—"}</p>
            <p className="font-mono text-[12px] text-ink-2">
              residency {residency} · approval {approval} · pii {String(pii)}
            </p>
            <p className={cx("text-xs", validation.success ? "text-teal" : "text-ink-3")} role="status" aria-live="polite">
              {validation.success ? "Ready to submit." : `${issues.length} field(s) still need attention.`}
            </p>
          </div>
          <div className="border-t border-steel px-5 py-4">
            <button type="submit" className={cx(btn.primary, "w-full")} disabled={pending} data-testid="submit-request">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Submit for fit assessment
            </button>
            {serverError ? (
              <p className="mt-2 text-sm text-red" role="alert">
                {serverError}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-ink-3">
              AI drafts the form and explains the result. Only the deterministic policy decides, and AI text can never change it.
            </p>
          </div>
        </div>
      </aside>
    </form>
  );
}

/** What the AI drafted: the buyer's words behind each field, and what is still open. */
function DraftReview({ draft }: { draft: IntakeDraft }) {
  // One sentence often backs several fields; show it once with every field it supports.
  const byQuote = new Map<string, string[]>();
  for (const e of draft.evidence) byQuote.set(e.quote, [...(byQuote.get(e.quote) ?? []), e.field]);
  return (
    <div className="mt-4 border-t border-steel pt-4" data-testid="draft-result">
      <p className="text-sm font-semibold text-ink" role="status">
        The form below was drafted from your text. Check it before you submit.
      </p>
      <p className="mt-0.5 text-[12px] text-ink-3">{draft.extractor.label}</p>
      {draft.checks.length ? (
        <div className="mt-3 border-l-[3px] border-amber-line bg-amber-bg px-4 py-3">
          <p className="text-sm font-semibold text-ink">Still open ({draft.checks.length})</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-2">
            {draft.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.evidence.length ? (
        <details open className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Your words behind each field ({draft.evidence.length} fields)</summary>
          <dl className="mt-2 divide-y divide-steel border-y border-steel">
            {[...byQuote].map(([quote, fields]) => (
              <div key={quote} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-4">
                <dt className="font-semibold text-ink-2">{fields.join(" · ")}</dt>
                <dd className="text-ink-2">“{quote}”</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
