import { Check, ChevronDown, Minus, X } from "lucide-react";
import type { ProofRunRow } from "@/db/schema";
import { failureLabel, runExhibit, statusLabel } from "@/lib/display";
import { personName } from "@/lib/people";
import type { ProofLogLine, ProofStepResult } from "@/lib/proofs/runner";
import { CopyButton } from "./client/copy-button";
import { Badge, Card, ExhibitTag, Mono, SealStrip, cx, formatDate, statusTone } from "./ui";

const STEP_ICON = {
  PASS: { icon: Check, cls: "bg-teal text-white", label: "passed" },
  FAIL: { icon: X, cls: "bg-red text-white", label: "failed" },
  SKIPPED: { icon: Minus, cls: "border border-dashed border-ink-3 text-ink-3", label: "skipped" },
} as const;

const RESULT_INK: Record<string, string> = {
  teal: "text-teal",
  red: "text-red",
  amber: "text-amber",
  neutral: "text-ink-2",
  ink: "text-ink",
};

/**
 * One proof run as an exhibit, summary first: result, the environment it ran in,
 * and the steps. The seal carries the artifact digest; logs, hashes and the
 * reproduce command fold out from under it.
 */
export function ProofRunCard({ run, action }: { run: ProofRunRow; action?: React.ReactNode }) {
  const steps = (run.stepsJson ?? []) as ProofStepResult[];
  const logs = (run.logsJson ?? []) as ProofLogLine[];
  const env = run.environmentJson as {
    envVersion: string;
    hubspot: { apiVersion: string; grantedScopes: string[] };
    approvalWorkflow: { enabled: boolean };
  };
  const done = ["PASSED", "FAILED", "INCONCLUSIVE"].includes(run.status);
  const tone = statusTone(run.status);
  const exhibit = runExhibit(run.runNumber);
  return (
    <Card as="article" className="overflow-hidden">
      <header className="grid gap-4 border-b border-steel px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-6">
        <div className="flex min-w-0 items-start gap-4">
          <ExhibitTag n={exhibit} label={`Proof run ${run.runNumber}`} className="mt-0.5" />
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em]">Run {run.runNumber}</span>
              <span className={cx("text-[16px] font-bold", RESULT_INK[tone])}>
                {statusLabel(run.status)}
                {run.failureClass ? `: ${failureLabel(run.failureClass).toLowerCase()}` : ""}
              </span>
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              Simulated HubSpot {env.hubspot.apiVersion} · scopes{" "}
              <span className="font-mono text-[12px]">{env.hubspot.grantedScopes.join(", ") || "none"}</span> · approval gate{" "}
              {env.approvalWorkflow.enabled ? "on" : "off"}
            </p>
            <p className="mt-1 text-[14px] text-ink-3">
              Queued by {personName(run.queuedBy)}: {run.queuedReason}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {run.failureClass ? (
            <Badge tone="red" mono title={failureLabel(run.failureClass)}>
              {run.failureClass}
            </Badge>
          ) : null}
          {action}
        </div>
      </header>

      <div className="px-5 py-5 sm:px-6">
        {steps.length ? (
          <ol aria-label={`Run ${run.runNumber} test steps`}>
            {steps.map((s) => {
              const st = STEP_ICON[s.status];
              const Icon = st.icon;
              return (
                <li key={s.id} className="group relative flex gap-3 pb-4 last:pb-0">
                  <span aria-hidden className="absolute top-7 bottom-0 left-[11px] w-px bg-steel group-last:hidden" />
                  <span className={cx("relative grid size-6 shrink-0 place-items-center rounded-[2px] bg-surface", st.cls)}>
                    <Icon className="size-3.5" strokeWidth={2.5} aria-label={st.label} />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cx("font-semibold", s.status === "SKIPPED" ? "text-ink-3" : "text-ink")}>{s.name}</span>
                      {s.code ? (
                        <Badge tone={s.status === "FAIL" ? "red" : "neutral"} mono>
                          {s.code}
                        </Badge>
                      ) : null}
                    </p>
                    <p className={cx("mt-0.5 leading-relaxed break-words", s.status === "SKIPPED" ? "text-ink-3" : "text-ink-2")}>
                      {s.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-ink-3">Not executed yet. The runner receives only the test case and this simulated environment.</p>
        )}
      </div>

      {done ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-stretch [&::-webkit-details-marker]:hidden">
            <SealStrip
              hash={run.artifactDigest}
              value="Evidence: log, input hash, reproduce command"
              className="flex-1 transition-colors group-hover:bg-[#1d2229]"
            />
            <span className="flex items-center bg-ink px-3 text-white">
              <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <div className="space-y-5 bg-paper/60 px-5 py-5 sm:px-6">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[14px] text-ink-3">Artifact digest (SHA-256)</dt>
                <dd className="mt-1 flex items-start gap-1">
                  <Mono className="pt-1 text-[12px] text-ink">{run.artifactDigest}</Mono>
                  {run.artifactDigest ? <CopyButton value={run.artifactDigest} /> : null}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[14px] text-ink-3">Input fixture hash</dt>
                <dd className="mt-1">
                  <Mono>{run.inputFixtureHash}</Mono>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[14px] text-ink-3">Started · completed (simulated clock)</dt>
                <dd className="mt-1 text-ink-2 tabular">
                  {formatDate(run.startedAt)}
                  <br />
                  {formatDate(run.completedAt)}
                </dd>
              </div>
            </dl>
            {logs.length ? (
              <div className="overflow-hidden rounded-[3px] bg-ink">
                <p className="border-b border-white/10 px-4 py-2 text-[12px] text-white/75">Sanitized run log · {run.runnerVersion}</p>
                <pre
                  className="max-h-72 overflow-auto p-4 font-mono text-[12px] leading-relaxed"
                  tabIndex={0}
                  aria-label={`Run ${run.runNumber} log`}
                >
                  {logs.map((l, idx) => (
                    <span key={idx} className={cx("block", l.level === "ERROR" ? "text-red-line" : "text-white/85")}>
                      <span className="text-white/60">{l.offset}</span> {l.level.padEnd(5)} {l.step} {l.message}
                    </span>
                  ))}
                </pre>
              </div>
            ) : null}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[14px] text-ink-3">Reproduce this digest on your machine</p>
                <CopyButton value={run.reproduceCommand} label="Copy command" />
              </div>
              <pre
                tabIndex={0}
                aria-label={`Run ${run.runNumber} reproduce command`}
                className="overflow-x-auto rounded-[3px] border border-steel bg-surface p-3 font-mono text-[12px] text-ink-2"
              >
                {run.reproduceCommand}
              </pre>
            </div>
          </div>
        </details>
      ) : null}
    </Card>
  );
}
