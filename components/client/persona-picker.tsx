"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./api";

interface Persona {
  userId: string;
  label: string;
  blurb: string;
  name: string;
  title: string;
  org: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function continueLabel(p: Persona) {
  return p.label.startsWith("Reviewer") ? "Continue as reviewer" : `Continue as ${p.name.split(" ")[0]}`;
}

/**
 * Sign-in as a fictional persona. The judge's starting persona is the ink sheet on
 * top; the others are rows of one sign-in register below it.
 */
export function PersonaPicker({ personas }: { personas: Persona[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [featured, ...others] = personas;

  const signIn = async (userId: string) => {
    setPending(userId);
    setError(null);
    try {
      await postJson("/api/auth/login", { userId });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setPending(null);
    }
  };

  const action = (p: Persona) =>
    pending === p.userId ? (
      <>
        <Loader2 className="size-4 animate-spin" aria-hidden /> Signing in…
      </>
    ) : (
      <>
        {continueLabel(p)}
        <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
      </>
    );

  return (
    <div className="space-y-4">
      {featured ? (
        <button
          type="button"
          data-testid={`persona-${featured.userId}`}
          disabled={pending !== null}
          onClick={() => signIn(featured.userId)}
          className="group flex w-full flex-col rounded-[4px] bg-ink p-5 text-left text-white shadow-[0_2px_4px_rgba(13,16,20,0.08),0_16px_32px_-20px_rgba(13,16,20,0.5)] transition-colors duration-150 hover:bg-[#1a1f25] disabled:opacity-60 sm:p-6"
        >
          <span className="flex items-start gap-3">
            <span
              aria-hidden
              className="condensed grid size-10 shrink-0 place-items-center rounded-[2px] bg-marker text-[14px] font-extrabold tracking-[0.04em] text-ink"
            >
              {initials(featured.name)}
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{featured.name}</span>
              <span className="block text-[14px] leading-snug text-white/70">{featured.title}</span>
              <span className="block text-[14px] leading-snug text-white/70">{featured.org}</span>
            </span>
          </span>
          <span className="mt-4 inline-flex w-fit rounded-[2px] bg-marker px-1.5 py-0.5 text-[12px] font-semibold text-ink">
            {featured.label} · start here if you are judging
          </span>
          <span className="mt-2 text-sm leading-relaxed text-white/80">{featured.blurb}</span>
          <span className="mt-4 flex items-center gap-1.5 text-sm font-bold">{action(featured)}</span>
        </button>
      ) : null}

      <ul className="divide-y divide-steel overflow-hidden rounded-[4px] border border-steel bg-surface shadow-[0_1px_2px_rgba(13,16,20,0.05)]">
        {others.map((p) => (
          <li key={p.userId}>
            <button
              type="button"
              data-testid={`persona-${p.userId}`}
              disabled={pending !== null}
              onClick={() => signIn(p.userId)}
              className="group grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-paper/60 disabled:opacity-60 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
            >
              <span
                aria-hidden
                className="condensed grid size-10 shrink-0 place-items-center rounded-[2px] bg-mist text-[14px] font-extrabold tracking-[0.04em] text-ink-2"
              >
                {initials(p.name)}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-ink">{p.name}</span>
                  <span className="rounded-[2px] bg-mist px-1.5 py-0.5 text-[12px] font-semibold text-ink-2">{p.label}</span>
                </span>
                <span className="mt-0.5 block text-[14px] leading-snug text-ink-3">
                  {p.title} · {p.org}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-2">{p.blurb}</span>
              </span>
              <span className="col-start-2 flex items-center gap-1.5 text-sm font-bold text-ink sm:col-start-3">{action(p)}</span>
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
