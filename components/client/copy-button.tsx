"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

type CopyState = "idle" | "copied" | "failed";

/** Copies an exact value (hash, command, id) so evidence can be checked elsewhere. */
export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = (next: CopyState) => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), next === "failed" ? 3000 : 1600);
  };

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            show("copied");
          } catch {
            // Clipboard can be blocked (permissions, insecure context): say so instead of failing silently.
            show("failed");
          }
        }}
        className={cx(
          "inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-1 text-[12px] text-ink-3 transition-colors duration-150 hover:bg-mist hover:text-ink",
          state === "failed" && "text-red",
          className,
        )}
        aria-label={`${label}: ${value.slice(0, 24)}`}
      >
        {state === "copied" ? (
          <Check className="size-3.5 text-teal" aria-hidden />
        ) : state === "failed" ? (
          <X className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        <span aria-hidden>{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "Copied to clipboard" : state === "failed" ? "Copy failed. Select the text and copy it manually." : ""}
      </span>
    </>
  );
}
