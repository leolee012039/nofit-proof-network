import { ArrowRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { Callout, Disclosure, Empty, ExhibitTag, Finding, Mono, PageHeader, SealStrip, StatusBadge, btn, cx, input } from "@/components/ui";
import type { AgentAssessment } from "@/lib/ai/schema";
import { EXHIBIT, statusLabel } from "@/lib/display";
import { guard, pageActor } from "@/lib/page";
import { listOutcomes } from "@/lib/services/outcomes";
import { replayDecision } from "@/lib/services/replay";
import { listRequests } from "@/lib/services/requests";

export const metadata = { title: "Decision replay" };

const SEVERITY: Record<string, string> = {
  blocker: "a blocker",
  review: "a review item",
  missing: "missing information",
  condition: "a verified condition",
  risk: "a risk",
  info: "a notice",
  absent: "not present",
};

function Side({ label, a }: { label: string; a: AgentAssessment }) {
  const groups: Array<[string, AgentAssessment["hard_blockers"]]> = [
    ["Blockers", a.hard_blockers],
    ["Needs a decision", a.needs_review],
    ["Missing information", a.missing_information],
    ["Verified conditions", a.conditions],
  ];
  return (
    <div className="min-w-0 space-y-4 px-5 py-5 text-sm">
      <p className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{label}</span>
        <StatusBadge status={a.fit_status} />
      </p>
      {groups.map(([g, items]) =>
        items.length ? (
          <div key={g}>
            <p className="text-[14px] text-ink-3">
              {g} ({items.length})
            </p>
            <ul className="mt-1 space-y-1">
              {items.map((f) => (
                <li key={f.code} className="text-ink-2">
                  {f.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      <p className="border-t border-steel pt-3 text-[14px] text-ink-3">
        Proof offered: {a.proposed_proof ? "yes" : "no"} · proof outcomes cited:{" "}
        {a.evidence_refs.filter((c) => c.kind === "outcome").length}
      </p>
    </div>
  );
}

export default async function ReplayPage(props: PageProps<"/replay">) {
  const actor = await pageActor();
  const q = await props.searchParams;
  const requests = await listRequests(actor);
  const selected = typeof q.requestId === "string" ? q.requestId : requests.at(-1)?.request.id;
  const replay = selected ? await guard(() => replayDecision(actor, selected)) : null;
  const outcomes = replay?.ok ? await listOutcomes(actor) : [];
  const driving = replay?.ok ? outcomes.filter((o) => replay.value.diff.drivingOutcomeIds.includes(o.outcome.id)) : [];
  const pass = driving.find((o) => o.outcome.result === "PASS")?.outcome;

  return (
    <>
      <PageHeader title="What changed the decision">
        The same request, assessed twice by the same deterministic policy: once without proof evidence, once with every authorized,
        integrity-checked outcome record. No “the model learned” claim, only the evidence that moved the result.
      </PageHeader>

      {requests.length === 0 ? (
        <Empty
          title="Nothing to replay yet"
          action={
            <Link href="/settings" className={btn.secondary}>
              Play the scripted storyline
            </Link>
          }
        >
          Submit an assessment first, or let Settings replay the whole storyline through the real services.
        </Empty>
      ) : (
        <>
          {requests.length > 1 ? (
            <form method="get" className="mb-8 flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm sm:max-w-md">
                <span className="text-[14px] text-ink-3">Request</span>
                <select name="requestId" defaultValue={selected} className={cx(input, "mt-1")}>
                  {requests.map((r) => (
                    <option key={r.request.id} value={r.request.id}>
                      {r.request.title} ({statusLabel(r.latestAssessment?.fitStatus ?? "")})
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={btn.secondary}>
                Replay
              </button>
            </form>
          ) : null}

          {replay && !replay.ok ? <Callout tone="red">{replay.message}</Callout> : null}
          {replay?.ok ? (
            <div className="space-y-10">
              <section
                aria-label="Verdict comparison"
                className="overflow-hidden rounded-[4px] border border-steel bg-surface shadow-[0_1px_2px_rgba(13,16,20,0.05)]"
              >
                <div className="grid items-stretch md:grid-cols-[1fr_auto_1.25fr]">
                  <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center md:px-8">
                    <p className="flex items-center gap-2.5 text-[14px] text-ink-3">
                      <ExhibitTag n={EXHIBIT.verdict} size="sm" label="Fit verdict" />
                      Without proof evidence
                    </p>
                    <span className="relative inline-flex">
                      <Finding status={replay.value.diff.from} size="md" />
                      {replay.value.diff.statusChanged ? (
                        <span aria-hidden className="strike-draw absolute top-1/2 -right-2 -left-2 h-[2px] -translate-y-1/2 bg-ink" />
                      ) : null}
                    </span>
                    {replay.value.diff.statusChanged ? (
                      <p className="condensed text-[12px] font-bold tracking-[0.08em] text-ink-3 uppercase">Superseded</p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-center border-y border-steel bg-paper/60 px-6 py-3 md:border-x md:border-y-0">
                    <ArrowRight className="size-6 rotate-90 text-ink-3 md:rotate-0" aria-hidden />
                    <span className="sr-only">changes to</span>
                  </div>
                  <div
                    className={cx(
                      "flex flex-col items-center justify-center gap-5 px-6 py-10 text-center md:px-8",
                      replay.value.diff.statusChanged && "bg-teal-bg",
                    )}
                  >
                    <p className="text-[14px] font-semibold text-ink-2">With proof evidence</p>
                    <Finding status={replay.value.diff.to} size="xl" className={replay.value.diff.statusChanged ? "settle" : undefined} />
                    {pass ? (
                      <SealStrip hash={pass.artifactDigest} value="the passing outcome" animate className="w-full max-w-sm text-left" />
                    ) : null}
                  </div>
                </div>
                <div className="border-t border-steel px-6 py-6 sm:px-10">
                  {replay.value.diff.statusChanged ? (
                    <p className="mx-auto max-w-[62ch] text-center font-display text-[22px] leading-snug font-semibold text-balance text-ink">
                      {pass ? (
                        <>
                          A paid, bounded proof passed with{" "}
                          <span className="font-mono text-[16px] font-medium">{(pass.grantedPermissionsJson as string[]).join(" + ")}</span>
                          {(pass.conditionsJson as { approvalWorkflow?: boolean }).approvalWorkflow ? " and a human approval gate" : ""}.
                          With that evidence,{" "}
                          {replay.value.diff.findingChanges.length === 1
                            ? "the blocker became a condition"
                            : "the blockers became conditions"}
                          , so “{statusLabel(replay.value.diff.from)}” became “{statusLabel(replay.value.diff.to)}”.
                        </>
                      ) : (
                        <>Recorded proof outcomes changed the recommendation.</>
                      )}
                    </p>
                  ) : (
                    <p className="text-center text-[16px] text-ink-2">No change yet: there is no usable proof evidence for this request.</p>
                  )}
                  {driving.length ? (
                    <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
                      {driving.map((o) => (
                        <Link key={o.outcome.id} href={`/outcomes/${o.outcome.id}`} className="font-semibold text-ink underline">
                          Open the {o.outcome.result === "PASS" ? "passing" : "failing"} outcome record
                        </Link>
                      ))}
                    </p>
                  ) : null}
                </div>
              </section>

              {replay.value.diff.findingChanges.length ? (
                <section aria-labelledby="changes-heading">
                  <h2 id="changes-heading" className="font-display text-[22px] font-bold tracking-[-0.015em]">
                    What moved
                  </h2>
                  <ul className="mt-4 divide-y divide-steel border-y border-steel">
                    {replay.value.diff.findingChanges.map((f) => (
                      <li key={f.code} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <p className="text-[16px] font-semibold text-ink">{f.title}</p>
                          <p className="mt-0.5 text-sm text-ink-2">
                            Was {SEVERITY[f.from] ?? f.from}; now {SEVERITY[f.to] ?? f.to}
                            {f.verifiedByOutcomeIds.length ? ", backed by the passing proof outcome." : "."}
                          </p>
                        </div>
                        <p className="flex items-center gap-2">
                          <Finding tone={f.from === "blocker" ? "red" : "amber"} label={f.from} voided size="xs" />
                          <ArrowRight className="size-3.5 text-ink-3" aria-hidden />
                          <Finding tone="teal" label={f.to} size="xs" />
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="space-y-3">
                <Disclosure title="Evidence the second assessment used" meta={`${replay.value.diff.addedEvidence.length} new citations`}>
                  {replay.value.diff.addedEvidence.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-ink-3">None.</p>
                  ) : (
                    <ul className="divide-y divide-steel">
                      {replay.value.diff.addedEvidence.map((c) => (
                        <li key={c.sourceId} className="px-5 py-4 text-sm">
                          <p className="font-medium text-ink">{c.title}</p>
                          <p className="mt-1.5 max-w-[70ch] rounded-[2px] bg-paper/70 px-3 py-2 text-[14px] leading-relaxed text-ink-2">
                            “{c.excerpt}”
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-steel px-5 py-4 text-sm">
                    <p className="font-medium text-ink">Outcome records considered</p>
                    <ul className="mt-1.5 space-y-1">
                      {replay.value.outcomesConsidered.map((o) => (
                        <li key={o.id} className="flex flex-wrap items-center gap-2">
                          <Finding tone="teal" label={o.usable ? "Used" : "Excluded"} voided={!o.usable} size="xs" />
                          <span className="text-ink-2">{o.reason}</span>
                          <Mono className="text-ink-3">{o.id}</Mono>
                        </li>
                      ))}
                      {replay.value.outcomesConsidered.length === 0 ? (
                        <li className="text-ink-3">None available to this seller yet.</li>
                      ) : null}
                    </ul>
                  </div>
                </Disclosure>

                <Disclosure title="Reason codes" meta="Added and removed by the proof evidence">
                  <ul className="space-y-1.5 px-5 py-4 font-mono text-[14px]">
                    {replay.value.diff.reasonCodesAdded.map((r) => (
                      <li key={r} className="flex items-center gap-2 text-teal">
                        <Plus className="size-3.5 shrink-0" aria-label="added" /> {r}
                      </li>
                    ))}
                    {replay.value.diff.reasonCodesRemoved.map((r) => (
                      <li key={r} className="flex items-center gap-2 text-red">
                        <Minus className="size-3.5 shrink-0" aria-label="removed" /> {r}
                      </li>
                    ))}
                    {replay.value.diff.reasonCodesAdded.length + replay.value.diff.reasonCodesRemoved.length === 0 ? (
                      <li className="font-sans text-ink-3">No change.</li>
                    ) : null}
                  </ul>
                </Disclosure>

                <Disclosure title="Both assessments side by side">
                  <div className="grid divide-y divide-steel lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                    <Side label="Without proof evidence" a={replay.value.baseline} />
                    <Side label="With proof evidence" a={replay.value.after} />
                  </div>
                </Disclosure>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
