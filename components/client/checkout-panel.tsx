"use client";

import { ExternalLink, FlaskConical, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { btn, cx } from "@/components/ui";
import type { PayPalOneTimePaymentSession } from "@/types/paypal-v6";
import { captureOutcomeMessage, postJson } from "./api";

type Mode = "sandbox" | "fixture" | "disabled";
type Phase = "idle" | "loading-sdk" | "ready" | "unavailable" | "working";

const SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";
const SDK_TIMEOUT_MS = 15_000;

/** Loads the SDK once; a stale or failed tag never leaves the buyer on an endless spinner. */
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.paypal) return resolve();
    const timer = setTimeout(() => reject(new Error("The PayPal SDK took too long to load")), SDK_TIMEOUT_MS);
    const done = (fn: () => void) => () => {
      clearTimeout(timer);
      fn();
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      // The tag may have loaded (or failed) before this mount: poll instead of waiting for a missed event.
      const poll = setInterval(() => {
        if (window.paypal) {
          clearInterval(poll);
          done(resolve)();
        }
      }, 200);
      setTimeout(() => clearInterval(poll), SDK_TIMEOUT_MS);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.addEventListener("load", done(resolve), { once: true });
    s.addEventListener(
      "error",
      done(() => {
        s.remove();
        reject(new Error("Could not load the PayPal SDK"));
      }),
      { once: true },
    );
    document.head.appendChild(s);
  });
}

/**
 * Buyer checkout. Sandbox: PayPal JS SDK v6 one-time payment session, with a
 * redirect fallback. Fixture: a clearly labelled simulated approval page.
 * The UI never marks anything paid; it only reflects server-verified state.
 */
export function CheckoutPanel({
  contractId,
  mode,
  clientId,
  amountLabel,
}: {
  contractId: string;
  mode: Mode;
  clientId?: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => (mode === "sandbox" ? (clientId ? "loading-sdk" : "unavailable") : "idle"));
  const [message, setMessage] = useState<string | null>(() =>
    mode === "sandbox" && !clientId ? "PayPal Sandbox is missing its client ID. Use the redirect option below." : null,
  );
  const session = useRef<PayPalOneTimePaymentSession | null>(null);
  const starting = useRef(false);

  useEffect(() => {
    if (mode !== "sandbox" || !clientId) return;
    let cancelled = false;
    (async () => {
      try {
        await loadScript(SDK_URL);
        const sdk = await window.paypal!.createInstance({
          clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
          locale: "en-US",
        });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (!methods.isEligible("paypal")) throw new Error("PayPal is not eligible for this session");
        const created = sdk.createPayPalOneTimePaymentSession({
          onApprove: async (data) => {
            setPhase("working");
            setMessage("Approved in PayPal. Capturing and verifying on the server…");
            try {
              const result = await postJson<{ state?: string }>(`/api/paypal/orders/${encodeURIComponent(data.orderId)}/capture`);
              setMessage(captureOutcomeMessage(result));
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Capture failed. Use “Check status with PayPal” before paying again.");
            }
            setPhase("ready");
            router.refresh();
          },
          onCancel: () => setMessage("Checkout cancelled. Nothing was charged."),
          onError: (error) => {
            console.error("[nofit] PayPal SDK error", error);
            setMessage("PayPal reported an error. Nothing was marked paid. Try again or use the redirect option.");
          },
        });
        if (cancelled) return;
        session.current = created;
        setPhase("ready");
      } catch (err) {
        if (!cancelled) {
          setPhase("unavailable");
          setMessage(`${err instanceof Error ? err.message : "PayPal SDK unavailable"}. Use the redirect option below.`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, clientId, router]);

  async function startSdk() {
    if (!session.current || starting.current || phase !== "ready") return;
    starting.current = true;
    setMessage(null);
    const orderPromise = postJson<{ id: string }>("/api/paypal/orders", { contractId, flow: "sdk" }).then((o) => ({ orderId: o.id }));
    orderPromise.catch(() => undefined); // handled through start() below; avoids an unhandled rejection if start() throws first
    try {
      await session.current.start({ presentationMode: "auto" }, orderPromise);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start PayPal checkout");
    } finally {
      starting.current = false;
    }
  }

  async function startRedirect() {
    setPhase("working");
    setMessage(null);
    try {
      const o = await postJson<{ approveUrl: string | null }>("/api/paypal/orders", { contractId, flow: "redirect" });
      if (!o.approveUrl) throw new Error("PayPal did not return an approval link");
      window.location.assign(o.approveUrl);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start checkout");
      setPhase(mode === "sandbox" && session.current ? "ready" : mode === "sandbox" ? "unavailable" : "idle");
    }
  }

  async function startFixture() {
    setPhase("working");
    setMessage(null);
    try {
      const o = await postJson<{ approveUrl: string | null }>("/api/paypal/orders", { contractId });
      router.push(o.approveUrl ?? "/contracts");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not start checkout");
      setPhase("idle");
    }
  }

  if (mode === "disabled") {
    return <p className="text-sm text-red">Payments are disabled on this deployment (see Settings). Nothing can be paid.</p>;
  }

  return (
    <div className="space-y-3">
      {mode === "sandbox" ? (
        <>
          <p className="text-sm text-ink-2">
            Pay <strong className="tabular">{amountLabel}</strong> with a <strong>PayPal Sandbox</strong> buyer account (test money only).
          </p>
          <div className={cx("min-h-11", phase === "ready" ? "" : "opacity-60")}>
            {phase === "loading-sdk" ? (
              <span className="inline-flex items-center gap-2 text-sm text-ink-3">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading PayPal Sandbox…
              </span>
            ) : null}
            {phase === "ready" ? <paypal-button type="pay" onClick={() => void startSdk()} data-testid="paypal-button" /> : null}
            {phase === "working" ? (
              <span className="inline-flex items-center gap-2 text-sm text-ink-3">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Working with PayPal…
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={cx(btn.ghost, "-ml-2 underline decoration-steel-2 underline-offset-4")}
            onClick={() => void startRedirect()}
            disabled={phase === "working"}
          >
            <ExternalLink className="size-4" aria-hidden /> Or pay on the PayPal Sandbox site instead
          </button>
        </>
      ) : (
        <>
          <p className="flex gap-2 text-sm leading-relaxed text-ink-2">
            <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <span>
              PayPal Sandbox is not configured on this machine, so a clearly labelled <strong>simulated provider</strong> stands in. It runs
              the same server-side capture and verification, and it is never shown as a PayPal payment.
            </span>
          </p>
          <button
            type="button"
            className={btn.primary}
            onClick={() => void startFixture()}
            disabled={phase === "working"}
            data-testid="fixture-checkout"
          >
            {phase === "working" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Start simulated checkout ({amountLabel})
          </button>
        </>
      )}
      <div role="status" aria-live="polite" className="text-sm text-ink-2">
        {message}
      </div>
    </div>
  );
}
