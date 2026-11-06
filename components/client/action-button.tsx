"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { btn } from "@/components/ui";
import { useAction } from "./api";

export function ActionButton({
  url,
  body,
  children,
  variant = "primary",
  confirm,
  testId,
}: {
  url: string;
  body?: unknown;
  children: ReactNode;
  variant?: keyof typeof btn;
  confirm?: string;
  testId?: string;
}) {
  const { run, pending, error } = useAction();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        data-testid={testId}
        className={btn[variant]}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          void run(url, body);
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
