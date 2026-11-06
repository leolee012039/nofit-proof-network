import { FlaskConical } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Actor } from "@/lib/auth/actor";
import type { SystemStatus } from "@/lib/services/system";
import { MobileMenu } from "./client/mobile-menu";
import { NavLinks } from "./client/nav-links";
import { SignOutButton } from "./client/sign-out";
import { cx } from "./ui";

const ROLE_LABEL: Record<Actor["role"], string> = {
  buyer: "Buyer",
  seller_admin: "Seller · Admin",
  reviewer: "Reviewer · read-only",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Which providers this instance runs on: a marker per line, coloured by the same semantic tokens. */
function ModeList({ status }: { status: SystemStatus }) {
  const payTone = status.payment.kind === "sandbox" ? "bg-teal" : status.payment.kind === "fixture" ? "bg-amber" : "bg-red";
  const payLabel =
    status.payment.kind === "sandbox" ? "PayPal Sandbox" : status.payment.kind === "fixture" ? "Fixture payments" : "Payments off";
  return (
    <dl className="space-y-1.5 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-ink-3">Payments</dt>
        <dd className="flex items-center gap-1.5 font-medium text-ink-2">
          <span aria-hidden className={cx("size-2 rounded-[1px]", payTone)} />
          {payLabel}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt className="text-ink-3">AI</dt>
        <dd className="flex items-center gap-1.5 font-medium text-ink-2">
          <span aria-hidden className={cx("size-2 rounded-[1px]", status.ai.kind === "anthropic" ? "bg-teal" : "bg-steel-2")} />
          {status.ai.kind === "anthropic" ? "Live model" : "Offline evaluator"}
        </dd>
      </div>
    </dl>
  );
}

function Identity({ actor }: { actor: Actor }) {
  return (
    <div className="flex items-center gap-3 rounded-[3px] border border-steel px-3 py-2.5">
      <span
        aria-hidden
        className="condensed grid size-10 shrink-0 place-items-center rounded-[2px] bg-ink text-[14px] font-extrabold tracking-[0.04em] text-white"
      >
        {initials(actor.displayName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{actor.displayName}</span>
        <span className="block truncate text-[12px] text-ink-3">{actor.orgName}</span>
        <span className="mt-1 inline-block rounded-[2px] bg-paper px-1.5 py-px text-[12px] font-medium text-ink-2">
          {ROLE_LABEL[actor.role]}
        </span>
      </span>
    </div>
  );
}

/** Wordmark: an exhibit marker carrying the initials, then the name. Plain text inside the mobile menu's summary. */
function Wordmark({ link = true }: { link?: boolean }) {
  const body = (
    <>
      <span aria-hidden className="tent condensed grid h-7 min-w-11 place-items-center bg-marker px-3 text-[14px] font-extrabold text-ink">
        NF
      </span>
      <span className="leading-none">
        <span className="block text-[22px] font-extrabold tracking-[-0.02em] text-ink">NoFit</span>
        <span className="mt-0.5 block text-[12px] text-ink-3 group-hover:text-ink-2">Proof Network</span>
      </span>
    </>
  );
  return link ? (
    <Link href="/dashboard" className="group flex items-center gap-2.5 rounded-[2px] px-1">
      {body}
    </Link>
  ) : (
    <span className="flex items-center gap-2.5">{body}</span>
  );
}

export function AppShell({ actor, status, children }: { actor: Actor; status: SystemStatus; children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-[3px] bg-marker px-3 py-2 text-sm font-semibold text-ink ring-2 ring-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* Desktop sidebar: the case-file index */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r border-steel bg-surface px-4 py-6 lg:flex">
        <Wordmark />
        <Identity actor={actor} />
        <NavLinks role={actor.role} />
        <div className="mt-auto space-y-4 border-t border-steel pt-4">
          <ModeList status={status} />
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 border-b border-steel bg-surface lg:hidden">
        <MobileMenu brand={<Wordmark link={false} />}>
          <div className="space-y-4 border-t border-steel px-4 py-4">
            <Identity actor={actor} />
            <NavLinks role={actor.role} />
            <ModeList status={status} />
            <SignOutButton />
          </div>
        </MobileMenu>
      </header>

      <div className="min-w-0">
        <p className="flex items-center justify-center gap-2 border-b border-steel px-4 py-1.5 text-center text-[12px] text-ink-2">
          <FlaskConical className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span>
            <span className="font-semibold text-ink">Fictional demo.</span> Every organization, person and record is made up.{" "}
            {status.payment.kind === "sandbox"
              ? "Payments use PayPal Sandbox test money."
              : status.payment.kind === "fixture"
                ? "Payments are simulated (PayPal Sandbox is not configured)."
                : "Payments are switched off."}
          </span>
        </p>
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1280px] px-4 py-8 outline-none sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
