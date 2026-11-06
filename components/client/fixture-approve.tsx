"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "@/components/ui";
import { captureOutcomeMessage, postJson } from "./api";

/** Simulated payer approval, then the same server capture + verification path as PayPal. */
export function FixtureApprove({
  orderId,
  contractId,
  alreadyApproved,
}: {
  orderId: string;
  contractId: string;
  alreadyApproved: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={btn.primary}
        disabled={pending}
        data-testid="fixture-approve"
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            if (!alreadyApproved) await postJson(`/api/fixture-checkout/${encodeURIComponent(orderId)}/approve`);
            const result = await postJson<{ state?: string }>(`/api/paypal/orders/${encodeURIComponent(orderId)}/capture`);
            const message = captureOutcomeMessage(result);
            if (message !== null) {
              setError(message);
              setPending(false);
              return;
            }
            router.push(`/contracts/${contractId}`);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Approval failed");
            setPending(false);
          }
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {alreadyApproved ? "Capture approved fixture payment" : "Approve simulated payment"}
      </button>
      <button
        type="button"
        className={btn.ghost}
        disabled={pending}
        onClick={() => router.push(`/contracts/${contractId}?checkout=cancelled`)}
      >
        Cancel
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
