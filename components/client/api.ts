"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function postJson<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", "NETWORK");
  }
  let data: { error?: { message?: string; code?: string; details?: unknown } };
  try {
    data = await res.json();
  } catch {
    throw new ApiError(`The server sent an unexpected response (HTTP ${res.status}). Refresh the page and try again.`, "BAD_RESPONSE");
  }
  if (!res.ok) throw new ApiError(data.error?.message ?? `Request failed (HTTP ${res.status})`, data.error?.code, data.error?.details);
  return data as T;
}

/**
 * Server-verified capture result → message for the buyer. `null` means paid.
 * A 200 response is not "paid": DENIED and CAPTURE_PENDING are normal results.
 */
export function captureOutcomeMessage(result: { state?: string }): string | null {
  switch (result.state) {
    case "CAPTURED":
      return null;
    case "CAPTURE_PENDING":
      return "PayPal is still processing this payment. It is not paid yet, and the proof stays locked. Use “Check status with PayPal” later.";
    case "DENIED":
      return "The payment was declined. Nothing was charged. Start checkout again with another funding source.";
    default:
      return `The payment is not complete (state ${result.state ?? "unknown"}). Use “Check status with PayPal” to reconcile.`;
  }
}

/** Posts, then refreshes server components so the UI shows server-authoritative state. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(url: string, body?: unknown, onSuccess?: (data: T) => void) => {
      setPending(true);
      setError(null);
      try {
        const data = await postJson<T>(url, body);
        onSuccess?.(data);
        router.refresh();
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
        return null;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending, error, setError };
}
