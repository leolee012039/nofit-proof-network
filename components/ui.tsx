import { AlertTriangle, Check, ChevronDown, CircleDashed, Minus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { shortHash, statusLabel } from "@/lib/display";

export { statusLabel };

export type Tone = "neutral" | "teal" | "amber" | "red" | "ink";

const TONE: Record<Tone, string> = {
  neutral: "bg-mist text-ink-2 ring-steel-2",
  teal: "bg-teal-bg text-teal ring-teal-line",
  amber: "bg-amber-bg text-amber ring-amber-line",
  red: "bg-red-bg text-red ring-red-line",
  ink: "bg-ink text-white ring-ink",
};

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Small label. Sans by default; `mono` only for machine values (codes, versions, scopes). */
export function Badge({
  tone = "neutral",
  mono = false,
  title,
  children,
  className,
}: {
  tone?: Tone;
  mono?: boolean;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[12px] leading-4 whitespace-nowrap ring-1 ring-inset",
        mono ? "font-mono" : "font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  FIT: "teal",
  // A fit on verified conditions is good news: teal, with the conditions themselves shown in amber.
  CONDITIONAL_FIT: "teal",
  NO_FIT: "red",
  INSUFFICIENT_INFORMATION: "amber",
  NEEDS_REVIEW: "amber",
  DRAFT: "neutral",
  PROPOSED: "neutral",
  SELLER_APPROVED: "neutral",
  BUYER_ACCEPTED: "neutral",
  PAYMENT_PENDING: "amber",
  PAYMENT_FAILED: "red",
  PAID: "teal",
  PROOF_QUEUED: "neutral",
  RUNNING: "amber",
  PASSED: "teal",
  FAILED: "red",
  INCONCLUSIVE: "amber",
  CANCELLED: "neutral",
  QUEUED: "neutral",
  PASS: "teal",
  FAIL: "red",
  CREATED: "neutral",
  APPROVED: "neutral",
  CAPTURING: "amber",
  CAPTURED: "teal",
  CAPTURE_PENDING: "amber",
  CAPTURE_UNKNOWN: "amber",
  DENIED: "red",
  VERIFICATION_FAILED: "red",
  REFUNDED: "neutral",
  PARTIALLY_REFUNDED: "neutral",
  REVERSED: "neutral",
  VOIDED: "neutral",
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? "neutral";
}

/** Status in plain words on a small finding tag; the machine code stays available as a tooltip. */
export function StatusBadge({ status, contract = false }: { status: string; contract?: boolean }) {
  return <Finding status={status} contract={contract} size="xs" />;
}

/**
 * Exhibit marker: the yellow numbered tent set beside every record in a request's
 * chain. With `href` it jumps to that record (or its place in the custody strip).
 */
export function ExhibitTag({
  n,
  size = "md",
  href,
  label,
  className,
}: {
  n: string;
  size?: "sm" | "md" | "lg";
  href?: string;
  label?: string;
  className?: string;
}) {
  const sizes = {
    sm: "h-5 min-w-9 px-2.5 text-[12px]",
    md: "h-7 min-w-11 px-3 text-[16px]",
    lg: "h-10 min-w-15 px-4 text-[22px]",
  };
  const title = label ? `Exhibit ${n}: ${label}` : `Exhibit ${n}`;
  const cls = cx(
    "tent condensed inline-grid shrink-0 place-items-center bg-marker leading-none font-extrabold text-ink tabular",
    sizes[size],
    className,
  );
  const body = (
    <>
      <span className="sr-only">Exhibit </span>
      {n}
    </>
  );
  return href ? (
    <Link href={href} title={title} className={cx(cls, "transition-transform duration-150 ease-out hover:-translate-y-0.5")}>
      {body}
    </Link>
  ) : (
    <span title={title} className={cls}>
      {body}
    </span>
  );
}

const FINDING_FILL: Record<Tone, string> = {
  neutral: "bg-ink-2 text-white",
  teal: "bg-teal text-white",
  amber: "bg-amber text-white",
  red: "bg-red text-white",
  ink: "bg-ink text-white",
};

/** State is carried by the glyph as well as the colour. */
const FINDING_ICON: Record<Tone, LucideIcon> = {
  neutral: CircleDashed,
  teal: Check,
  amber: AlertTriangle,
  red: X,
  ink: Minus,
};

/** Statuses that end a record without a result: printed struck through, like voided evidence. */
const VOID_STATUSES = new Set(["CANCELLED", "VOIDED", "REVERSED"]);

/**
 * Finding tag: a state printed on an evidence tag. Large, it is the verdict or
 * result a page exists to deliver (one per screen); `xs` is the status label in
 * tables and lists. `voided` prints a superseded or excluded state struck through.
 */
export function Finding({
  status,
  tone: toneOverride,
  label,
  contract = false,
  voided = false,
  size = "md",
  className,
}: {
  status?: string;
  tone?: Tone;
  label?: string;
  contract?: boolean;
  voided?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const tone = toneOverride ?? statusTone(status ?? "");
  const struck = voided || (status !== undefined && VOID_STATUSES.has(status));
  const Icon = struck ? Minus : FINDING_ICON[tone];
  const sizes = {
    xs: "h-5 text-[12px]",
    sm: "h-6 text-[12px]",
    md: "h-8 text-[14px]",
    lg: "h-11 text-[16px]",
    xl: "h-16 text-[22px]",
  };
  return (
    <span
      title={status}
      className={cx(
        "finding-tag condensed inline-flex shrink-0 items-center gap-[0.35em] pr-[0.8em] pl-[1.3em] font-extrabold tracking-[0.05em] whitespace-nowrap uppercase",
        sizes[size],
        struck ? "bg-mist text-ink-3 line-through decoration-2" : FINDING_FILL[tone],
        className,
      )}
    >
      <Icon className="size-[1.05em] shrink-0" strokeWidth={3} aria-hidden />
      {label ?? statusLabel(status ?? "", contract)}
    </span>
  );
}

/**
 * Seal strip: the tamper tape across a record. Sealed records show the hash that
 * fixes them; pending ones are a dashed outline; void ones are struck through.
 */
export function SealStrip({
  label = "Sealed",
  value,
  hash,
  meta,
  state = "sealed",
  animate = false,
  className,
}: {
  label?: string;
  value?: ReactNode;
  hash?: string | null;
  meta?: ReactNode;
  state?: "sealed" | "pending" | "void";
  animate?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex min-h-8 min-w-0 items-stretch text-[12px] leading-tight",
        state === "sealed" && "bg-ink text-white",
        state === "pending" && "border border-dashed border-ink-3 bg-surface text-ink-2",
        state === "void" && "bg-mist text-ink-3",
        animate && state === "sealed" && "seal-close",
        className,
      )}
    >
      <span
        className={cx(
          "condensed flex shrink-0 items-center px-2.5 font-extrabold tracking-[0.08em] uppercase",
          state === "sealed" ? "bg-marker text-ink" : state === "void" ? "line-through" : "",
        )}
      >
        {label}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-1.5">
        {hash ? (
          <span className="min-w-0 truncate font-mono" title={hash}>
            sha256 {shortHash(hash)}
          </span>
        ) : null}
        {value ? <span className={cx("min-w-0", state === "void" && "line-through")}>{value}</span> : null}
        {meta ? <span className={cx("ml-auto shrink-0", state === "sealed" ? "text-white/70" : "text-ink-3")}>{meta}</span> : null}
      </span>
    </div>
  );
}

export function Card({
  children,
  className,
  as: As = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <As className={cx("rounded-[4px] border border-steel bg-surface shadow-[0_1px_2px_rgba(13,16,20,0.05)]", className)}>{children}</As>
  );
}

/** Card title row. Supporting metadata sits BELOW the title, never above it. */
export function CardHeader({
  title,
  meta,
  action,
  exhibit,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  exhibit?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-steel px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        {exhibit ? <ExhibitTag n={exhibit} size="sm" className="mt-0.5" /> : null}
        <div className="min-w-0">
          <h2 className="text-[16px] leading-snug font-semibold text-ink">{title}</h2>
          {meta ? <p className="mt-0.5 text-[14px] text-ink-3">{meta}</p> : null}
          {children ? <div className="mt-1.5 text-sm leading-relaxed text-ink-3">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/**
 * Page title. `record` pages (a request, a contract) name the record in a quiet
 * 22px line so the verdict or status below stays the one display element.
 */
export function PageHeader({
  meta,
  title,
  exhibit,
  size = "display",
  children,
  actions,
}: {
  meta?: ReactNode;
  title: ReactNode;
  exhibit?: string;
  size?: "display" | "record";
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", size === "record" ? "mb-6" : "mb-8")}>
      <div className="min-w-0 max-w-3xl">
        <div className="flex items-start gap-4">
          {exhibit ? <ExhibitTag n={exhibit} size="lg" className="mt-0.5" /> : null}
          <h1
            className={cx(
              "font-display font-bold text-balance text-ink",
              size === "record"
                ? "text-[22px] leading-tight tracking-[-0.01em]"
                : "text-[32px] leading-[1.06] tracking-[-0.02em] sm:text-[40px]",
            )}
          >
            {title}
          </h1>
        </div>
        {meta ? <p className="mt-2.5 text-[14px] text-ink-3">{meta}</p> : null}
        {children ? <div className="mt-3 max-w-[68ch] text-[16px] leading-relaxed text-ink-2">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Callout({ tone = "neutral", title, children }: { tone?: Tone; title?: ReactNode; children: ReactNode }) {
  const ring: Record<Tone, string> = {
    neutral: "border-steel bg-surface",
    teal: "border-teal-line bg-teal-bg",
    amber: "border-amber-line bg-amber-bg",
    red: "border-red-line bg-red-bg",
    ink: "border-ink bg-ink text-white",
  };
  return (
    <div className={cx("rounded-[3px] border px-4 py-3 text-sm leading-relaxed", ring[tone])} role={tone === "red" ? "alert" : undefined}>
      {title ? <p className="mb-0.5 font-semibold text-ink">{title}</p> : null}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

/**
 * Evidence on demand: a closed-by-default section. The summary says what is
 * inside and how much, so nothing is hidden, only folded.
 */
export function Disclosure({
  title,
  meta,
  children,
  open = false,
  className,
  id,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <details id={id} open={open} className={cx("group rounded-[4px] border border-steel bg-surface", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[4px] px-5 py-4 transition-colors duration-150 hover:bg-paper/60 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[16px] leading-snug font-semibold text-ink">{title}</span>
          {meta ? <span className="mt-0.5 block text-[14px] text-ink-3">{meta}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-steel">{children}</div>
    </details>
  );
}

/**
 * Ruled form cells, like the fields on a custody form: label left and entry right
 * where there is room, label printed above the entry in a narrow column.
 */
export function KeyValue({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="@container divide-y divide-steel border-y border-steel text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="grid gap-x-5 gap-y-0.5 py-2.5 @[28rem]:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]">
          <dt className="condensed pt-px text-[12px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[4px] border border-dashed border-ink-3/50 bg-surface/60 px-6 py-10 text-center">
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-3">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("font-mono text-[12px] break-all text-ink-2", className)}>{children}</code>;
}

const press = "transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px";

export const btn = {
  primary: cx(
    "inline-flex items-center justify-center gap-2 rounded-[3px] bg-ink px-4 py-2.5 text-sm leading-5 font-semibold text-white shadow-[0_1px_2px_rgba(13,16,20,0.2)] hover:bg-[#272c33] disabled:cursor-not-allowed disabled:opacity-50",
    press,
  ),
  /** The yellow action: the one step a page exists to move the evidence forward. */
  marker: cx(
    "inline-flex items-center justify-center gap-2 rounded-[3px] bg-marker px-4 py-2.5 text-sm leading-5 font-bold text-ink shadow-[inset_0_-2px_0_var(--color-marker-edge)] hover:bg-[#ffcf3d] disabled:cursor-not-allowed disabled:opacity-50",
    press,
  ),
  secondary: cx(
    "inline-flex items-center justify-center gap-2 rounded-[3px] border border-steel-2 bg-surface px-4 py-2.5 text-sm leading-5 font-semibold text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50",
    press,
  ),
  ghost: cx("inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-sm text-ink-2 hover:bg-mist hover:text-ink", press),
  danger: cx(
    "inline-flex items-center justify-center gap-2 rounded-[3px] border border-red-line bg-surface px-4 py-2.5 text-sm leading-5 font-semibold text-red hover:bg-red-bg disabled:opacity-50",
    press,
  ),
};

export const input =
  "block w-full rounded-[3px] border border-steel-2 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 hover:border-ink-3 focus:border-ink focus:outline-none focus:ring-4 focus:ring-marker/40";

export function DemoTag({ children = "Demo sample data" }: { children?: ReactNode }) {
  return <Badge tone="neutral">{children}</Badge>;
}

const asDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d);

/** "Oct 26, 2026 · 17:54 UTC": short enough not to wrap in tables. */
export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = asDate(d);
  const day = date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
  return `${day} · ${time} UTC`;
}

export function formatDay(d: Date | string | null | undefined) {
  if (!d) return "—";
  return asDate(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export interface RailStep {
  key: string;
  label: string;
  state: "done" | "current" | "todo" | "blocked";
  note?: string;
  /** Optional link to the record that completed (or will complete) this step. */
  href?: string;
}

/** Step mark: the state reads from the shape as well as the colour. */
function StepMark({ step, index }: { step: RailStep; index: number }) {
  const n = String(index + 1);
  // The yellow tent means an exhibit, never a step: the current step is an ink numeral under the yellow bar.
  return (
    <span
      className={cx(
        "condensed grid h-5 min-w-5 shrink-0 place-items-center rounded-[2px] px-1 text-[12px] font-bold tabular",
        step.state === "current" && "bg-ink text-marker",
        step.state === "done" && "bg-ink text-white",
        step.state === "todo" && "border border-dashed border-ink-3 text-ink-3",
        step.state === "blocked" && "bg-red text-white",
      )}
    >
      {step.state === "done" ? (
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      ) : step.state === "blocked" ? (
        <X className="size-3.5" strokeWidth={3} aria-hidden />
      ) : (
        n
      )}
    </span>
  );
}

function stateText(s: RailStep) {
  return s.state === "done" ? " (done)" : s.state === "current" ? " (current)" : s.state === "blocked" ? " (blocked)" : "";
}

function StepLabel({ step, className }: { step: RailStep; className: string }) {
  return step.href ? (
    <Link href={step.href} className={cx(className, "underline decoration-steel-2 underline-offset-4 hover:decoration-ink")}>
      {step.label}
    </Link>
  ) : (
    <span className={className}>{step.label}</span>
  );
}

/** The strip above each step: solid when done, yellow where things stand, dashed ahead, red when blocked. */
function StepBar({ state }: { state: RailStep["state"] }) {
  return (
    <span
      aria-hidden
      className={cx(
        "block",
        state === "done" && "h-[3px] bg-ink",
        state === "current" && "h-[5px] bg-marker",
        state === "blocked" && "h-[3px] bg-red",
        state === "todo" && "mt-px mb-[2px] border-t-2 border-dashed border-steel-2",
      )}
    />
  );
}

/**
 * Custody strip: the chain of steps a record moves through. Horizontal from md
 * up (labels wrap, never scroll); on phones a one-line summary that expands.
 */
export function Rail({ steps, label }: { steps: RailStep[]; label: string }) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.state === "current" || s.state === "blocked"),
  );
  const allDone = steps.every((s) => s.state === "done");
  const focus = allDone ? steps.length - 1 : currentIndex;
  return (
    <>
      <ol
        className="hidden gap-x-1.5 md:grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        aria-label={label}
      >
        {steps.map((s, i) => (
          <li key={s.key} className="min-w-0" aria-current={s.state === "current" ? "step" : undefined}>
            <StepBar state={s.state} />
            <div className="mt-2.5 flex items-start gap-2">
              <StepMark step={s} index={i} />
              <div className="min-w-0 pt-px">
                <StepLabel
                  step={s}
                  className={cx("block text-[14px] leading-tight", s.state === "current" ? "font-semibold text-ink" : "text-ink-2")}
                />
                {s.note ? <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{s.note}</span> : null}
                <span className="sr-only">{stateText(s)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <details className="group md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
          <StepMark step={steps[focus]} index={focus} />
          <span className="min-w-0 flex-1 text-[14px]">
            <span className="font-semibold text-ink">{steps[focus].label}</span>
            <span className="text-ink-3">
              {" "}
              · step {focus + 1} of {steps.length}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="mt-4 space-y-3" aria-label={label}>
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3" aria-current={s.state === "current" ? "step" : undefined}>
              <StepMark step={s} index={i} />
              <StepLabel step={s} className={cx("text-[14px]", s.state === "current" ? "font-semibold text-ink" : "text-ink-2")} />
              {s.note ? <span className="text-[12px] text-ink-3">{s.note}</span> : null}
              <span className="sr-only">{stateText(s)}</span>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}
