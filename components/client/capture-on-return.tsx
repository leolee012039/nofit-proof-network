"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { captureOutcomeMessage, postJson } from "./api";

/** Returning from the PayPal redirect: capture on the server, then show only the server-verified result. */
export function CaptureOnReturn({ orderId, contractId }: { orderId: string; contractId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [problem, setProblem] = useState<{ text: string; isError: boolean } | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    postJson<{ state?: string }>(`/api/paypal/orders/${encodeURIComponent(orderId)}/capture`)
      .then((result) => {
        const message = captureOutcomeMessage(result);
        if (message === null) router.replace(`/contracts/${contractId}`);
        else setProblem({ text: message, isError: false });
      })
      .catch((e: unknown) => setProblem({ text: e instanceof Error ? e.message : "Capture failed", isError: true }));
  }, [orderId, contractId, router]);
  if (problem) {
    return (
      <div className="space-y-2 text-sm">
        <p role={problem.isError ? "alert" : "status"} className={problem.isError ? "text-red" : "text-amber"}>
          {problem.text}
        </p>
        <Link href={`/contracts/${contractId}`} className="underline">
          Back to the contract (use “Check status with PayPal” to reconcile)
        </Link>
      </div>
    );
  }
  return (
    <p role="status" className="inline-flex items-center gap-2 text-sm text-ink-2">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Capturing and verifying amount, currency and reference on the server…
    </p>
  );
}
