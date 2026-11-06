import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Info,
  Lightbulb,
  MessageCircleQuestion,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AgentAssessment } from "@/lib/ai/schema";
import { EXHIBIT, statusLabel } from "@/lib/display";
import { Badge, Disclosure, ExhibitTag, Finding, Mono, SealStrip, cx, formatDate } from "./ui";

type FindingOut = AgentAssessment["hard_blockers"][number];
type Citation = AgentAssessment["evidence_refs"][number];

const VERDICT: Record<string, { headline: string; copy: string }> = {
  NO_FIT: {
    headline: "Not a fit, as requested",
    copy: "The requested, unmodified scope cannot run. This is not a claim that the integration is impossible.",
  },
  CONDITIONAL_FIT: {
    headline: "A fit, on verified conditions",
    copy: "Feasible under the conditions below, which earlier proof evidence verified in a simulated environment.",
  },
  INSUFFICIENT_INFORMATION: {
    headline: "Not enough to decide yet",
    copy: "Compatibility is not assumed where evidence is missing. Answer the open questions to continue.",
  },
  NEEDS_REVIEW: {
    headline: "Needs a human decision",
    copy: "A policy conflict has to be resolved by a person before this can proceed.",
  },
  FIT: {
    headline: "A fit",
    copy: "No blockers found against the seller's documented capabilities and policies.",
  },
};

const GROUPS = [
  { key: "hard_blockers", title: "Blockers", icon: AlertOctagon, tone: "text-red", mark: "bg-red text-white", primary: true },
  {
    key: "conditions",
    title: "Conditions, verified by proof",
    icon: CheckCircle2,
    tone: "text-teal",
    mark: "bg-teal text-white",
    primary: true,
  },
  {
    key: "needs_review",
    title: "Needs a human decision",
    icon: ShieldAlert,
    tone: "text-amber",
    mark: "bg-amber-bg text-amber ring-1 ring-inset ring-amber-line",
    primary: true,
  },
  {
    key: "missing_information",
    title: "Missing information",
    icon: CircleHelp,
    tone: "text-amber",
    mark: "bg-amber-bg text-amber ring-1 ring-inset ring-amber-line",
    primary: true,
  },
  { key: "soft_risks", title: "Risks to note", icon: AlertTriangle, tone: "text-ink-2", mark: "bg-mist text-ink-2", primary: false },
  { key: "notices", title: "Notices", icon: Info, tone: "text-ink-2", mark: "bg-mist text-ink-2", primary: false },
] as const;

/** Inline citation chips; the accessible name carries the source title, not just "S4". */
function Refs({ refs, sources }: { refs: string[]; sources: Citation[] }) {
  if (!refs.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-[1px]">
      {refs.map((r) => {
        const src = sources.find((c) => c.ref === r);
        const name = src ? `Source ${r.replace(/^S/, "")}: ${src.title}` : `Source ${r}`;
        return (
          <a
            key={r}
            href={`#cite-${r}`}
            title={src?.title}
            aria-label={name}
            className="rounded-[2px] bg-ink/[0.07] px-1 font-mono text-[12px] text-ink-2 no-underline transition-colors hover:bg-ink hover:text-white"
          >
            {r}
          </a>
        );
      })}
    </span>
  );
}

/**
 * A condition is stated as what must hold (its remediation), not as the problem it
 * used to be: "Required CRM write scope is missing" reads wrong under "Holds if".
 */
function asCondition(f: FindingOut): { text: string; was: string | null } {
  return f.severity === "condition" && f.remediation ? { text: f.remediation, was: f.title } : { text: f.title, was: null };
}

function FindingItem({ f, group, sources }: { f: FindingOut; group: (typeof GROUPS)[number]; sources: Citation[] }) {
  const Icon = group.icon;
  const shown = asCondition(f);
  return (
    <li className="flex gap-3 py-4">
      <span aria-hidden className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-[2px]", group.mark)}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 text-[16px]">
        <p className="font-semibold text-ink">{shown.text}</p>
        {shown.was ? <p className="mt-0.5 text-[14px] text-ink-3">Resolves: {shown.was}</p> : null}
        <p className="mt-1 leading-relaxed text-ink-2">
          {f.detail}
          <Refs refs={f.citation_refs} sources={sources} />
        </p>
        {f.remediation && !shown.was ? (
          <p className="mt-2 leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">How to fix:</span> {f.remediation}
          </p>
        ) : null}
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Badge mono title="Policy rule">
            {f.code}
          </Badge>
          {f.original_severity && f.original_severity !== f.severity ? (
            <Badge tone="teal">
              was a {f.original_severity}, now a {f.severity}
            </Badge>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function FindingGroup({ group, items, sources }: { group: (typeof GROUPS)[number]; items: FindingOut[]; sources: Citation[] }) {
  if (!items.length) return null;
  const Icon = group.icon;
  return (
    <section>
      <h3 className={cx("flex items-center gap-2 text-[14px] font-bold", group.tone)}>
        <Icon className="size-4" aria-hidden />
        {group.title} <span className="font-normal text-ink-3">({items.length})</span>
      </h3>
      <ul className="mt-1 divide-y divide-steel border-b border-steel">
        {items.map((f) => (
          <FindingItem key={`${f.code}-${f.title}`} f={f} group={group} sources={sources} />
        ))}
      </ul>
    </section>
  );
}

function ListBlock({ title, icon, items }: { title: string; icon: ReactNode; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[14px] font-bold text-ink">
        {icon}
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-[16px] leading-relaxed text-ink-2">
        {items.map((x) => (
          <li key={x} className="flex gap-2.5">
            <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-[1px] bg-ink-3" />
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The single most decision-relevant finding: what blocks, or what the "yes" depends on. */
function mainFinding(a: AgentAssessment): { label: string; ink: string; f: FindingOut } | null {
  if (a.hard_blockers[0]) return { label: "Blocked by", ink: "text-red", f: a.hard_blockers[0] };
  if (a.needs_review[0]) return { label: "Needs a decision", ink: "text-amber", f: a.needs_review[0] };
  if (a.missing_information[0]) return { label: "Missing", ink: "text-amber", f: a.missing_information[0] };
  if (a.conditions[0]) return { label: "Holds if", ink: "text-teal", f: a.conditions[0] };
  return null;
}

/**
 * The answer, first: exhibit 02, the verdict, the one reason that matters, the
 * seal that logs it, and (via `next`) the one thing to do about it. The page's
 * only finding tag lives here.
 */
export function VerdictHero({
  a,
  override,
  seal,
  next,
}: {
  a: AgentAssessment;
  override: null | { status: string; reason: string; byName: string; at: string; policyStatus: string };
  seal?: { hash: string; at: Date | string; policy: string };
  next?: ReactNode;
}) {
  const v = VERDICT[a.fit_status] ?? VERDICT.NEEDS_REVIEW;
  const main = mainFinding(a);
  return (
    <section
      aria-label="Verdict"
      className="overflow-hidden rounded-[4px] border border-steel bg-surface shadow-[0_1px_2px_rgba(13,16,20,0.05)]"
    >
      <div className="px-5 pt-6 pb-6 sm:px-8 sm:pt-7">
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <ExhibitTag n={EXHIBIT.verdict} size="lg" label="Fit verdict" className="mt-1" />
            <div className="min-w-0">
              <h2 className="font-display text-[32px] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-ink sm:text-[40px]">
                {v.headline}
              </h2>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{v.copy}</p>
            </div>
          </div>
          <Finding status={a.fit_status} size="lg" className="justify-self-start md:mt-1" />
        </div>
        {main ? (
          <dl className="mt-6 grid rounded-[3px] border border-steel sm:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]">
            <dt className={cx("condensed px-4 pt-3 text-[12px] font-extrabold tracking-[0.07em] uppercase sm:py-4", main.ink)}>
              {main.label}
            </dt>
            <dd className="min-w-0 px-4 pt-1 pb-3.5 sm:border-l sm:border-steel sm:py-3.5">
              <p className="text-[16px] font-semibold text-ink">{asCondition(main.f).text}</p>
              {asCondition(main.f).was ? (
                <p className="mt-1 text-[14px] text-ink-3">Resolves: {asCondition(main.f).was}</p>
              ) : main.f.remediation ? (
                <p className="mt-1 text-[16px] leading-relaxed text-ink-2">
                  <span className="font-semibold text-ink">How to fix:</span> {main.f.remediation}
                </p>
              ) : null}
            </dd>
          </dl>
        ) : null}
        {override ? (
          <div className="mt-4 flex gap-3 rounded-[3px] border border-amber-line bg-amber-bg px-4 py-3 text-sm">
            <UserCheck className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <div>
              <p className="font-semibold text-ink">
                {override.byName} overrode this to “{statusLabel(override.status)}”
              </p>
              <p className="mt-1 text-ink-2">“{override.reason}”</p>
              <p className="mt-1 text-[14px] text-ink-3">
                The policy result ({statusLabel(override.policyStatus)}) and its findings stay on record.
              </p>
            </div>
          </div>
        ) : null}
      </div>
      {seal ? (
        <SealStrip
          label="Logged"
          hash={seal.hash}
          value={`policy ${seal.policy}`}
          meta={formatDate(seal.at)}
          animate
          className="border-t border-ink"
        />
      ) : null}
      {next}
    </section>
  );
}

/** Findings that change the decision are open; context (risks, notices, assumptions, questions) is folded. */
export function FindingsSection({ a }: { a: AgentAssessment }) {
  const live = a.evaluator.mode === "live";
  const sources = a.evidence_refs;
  const secondary = GROUPS.filter((g) => !g.primary);
  const extraCount =
    secondary.reduce((n, g) => n + (a[g.key] as FindingOut[]).length, 0) +
    a.assumptions.length +
    a.questions_for_buyer.length +
    a.safe_alternatives.length;

  return (
    <section aria-labelledby="assessment-heading" className="space-y-6">
      <h2 id="assessment-heading" className="font-display text-[22px] font-bold tracking-[-0.015em]">
        Why
      </h2>

      {a.hard_blockers.length === 0 ? (
        <p className="flex items-center gap-2 text-[16px] text-teal">
          <CheckCircle2 className="size-4" aria-hidden /> No blockers.
        </p>
      ) : null}
      {GROUPS.filter((g) => g.primary).map((g) => (
        <FindingGroup key={g.key} group={g} items={a[g.key] as FindingOut[]} sources={sources} />
      ))}

      <Disclosure
        open
        title="The written explanation"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={live ? "teal" : "neutral"}>{live ? `Live AI · ${a.evaluator.model}` : "Offline evaluator"}</Badge>
            <span>
              {live ? "Explains the policy decision; it cannot change it" : "No language model was called"}
              {a.evaluator.fallbackReason ? ` (fallback: ${a.evaluator.fallbackReason})` : ""}
            </span>
          </span>
        }
      >
        <div className="space-y-3 px-5 py-5">
          <div className="max-w-[68ch] space-y-3 text-[16px] leading-relaxed whitespace-pre-line text-ink-2">{a.explanation}</div>
          <p className="text-[14px] text-ink-3">
            {a.evaluator.label}
            {a.evaluator.modelDisagreedWithPolicy
              ? `. The model suggested “${statusLabel(a.evaluator.modelSuggestedStatus ?? "")}”; the policy decision was kept.`
              : ""}
          </p>
        </div>
      </Disclosure>

      {extraCount > 0 ? (
        <Disclosure title="More context" meta={`${extraCount} risks, notices, assumptions and questions`}>
          <div className="space-y-6 px-5 py-5">
            {secondary.map((g) => (
              <FindingGroup key={g.key} group={g} items={a[g.key] as FindingOut[]} sources={sources} />
            ))}
            <ListBlock
              title="Assumptions to confirm"
              icon={<CircleHelp className="size-4 text-ink-3" aria-hidden />}
              items={a.assumptions}
            />
            <ListBlock
              title="Questions for the buyer"
              icon={<MessageCircleQuestion className="size-4 text-ink-3" aria-hidden />}
              items={a.questions_for_buyer}
            />
            <ListBlock
              title="Safer alternatives"
              icon={<Lightbulb className="size-4 text-ink-3" aria-hidden />}
              items={a.safe_alternatives}
            />
          </div>
        </Disclosure>
      ) : null}
    </section>
  );
}

/** Every source the decision cites, folded; citation chips above jump here and the target is highlighted. */
export function EvidencePanel({ a }: { a: AgentAssessment }) {
  return (
    <Disclosure title="Sources behind this decision" meta={`${a.evidence_refs.length} cited · ${a.confidence_reason}`}>
      <ol className="divide-y divide-steel">
        {a.evidence_refs.map((c) => (
          <li key={c.ref} id={`cite-${c.ref}`} className="scroll-mt-24 px-5 py-4 text-sm target:bg-marker/20">
            <div className="flex gap-3">
              <span className="mt-px grid h-6 min-w-8 shrink-0 place-items-center rounded-[2px] bg-ink px-1.5 font-mono text-[12px] font-semibold text-white">
                {c.ref}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone={c.kind === "outcome" ? "teal" : "neutral"}>
                    {c.kind === "outcome" ? "Proof outcome" : c.kind === "capability" ? "Seller capability" : "Seller document"}
                  </Badge>
                  <Badge mono>v{String(c.version)}</Badge>
                  {c.trust === "untrusted_upload" ? <Badge tone="amber">Untrusted upload</Badge> : null}
                  {c.visibility === "seller_internal" ? <Badge>Seller-internal</Badge> : null}
                </p>
                <blockquote className="mt-2.5 rounded-[2px] bg-paper/70 px-3 py-2 text-[14px] leading-relaxed text-ink-2">
                  “{c.excerpt}”
                </blockquote>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="space-y-4 border-t border-steel px-5 py-4 text-sm">
        <div>
          <p className="font-semibold text-ink">Proof outcomes considered</p>
          {a.outcomes_considered.length === 0 ? (
            <p className="mt-0.5 text-ink-3">None yet: no authorized outcome evidence exists, or this is a baseline replay.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {a.outcomes_considered.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <Finding tone="teal" label={o.usable ? "Used" : "Excluded"} voided={!o.usable} size="xs" />
                  <span className="text-ink-2">{o.reason}</span>
                  <Mono className="text-ink-3">{o.id}</Mono>
                </li>
              ))}
            </ul>
          )}
        </div>
        {a.superseded_ignored.length ? (
          <div>
            <p className="font-semibold text-ink">Older document versions ignored</p>
            <ul className="mt-1 space-y-0.5 text-ink-3">
              {a.superseded_ignored.map((s) => (
                <li key={s.id}>
                  {s.docKey} v{s.version} (current v{s.currentVersion})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <p className="font-semibold text-ink">Reason codes</p>
          <p className="mt-1 font-mono text-[12px] leading-relaxed break-words text-ink-3">{a.reason_codes.join(" · ")}</p>
          <p className="mt-1 text-[14px] text-ink-3">Policy {a.policy_version}</p>
        </div>
      </div>
    </Disclosure>
  );
}
