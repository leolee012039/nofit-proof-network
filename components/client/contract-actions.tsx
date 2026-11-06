"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { btn, cx, input } from "@/components/ui";
import { useAction } from "./api";

export function AcceptPanel({ contractId, scopeHash, amountLabel }: { contractId: string; scopeHash: string; amountLabel: string }) {
  const { run, pending, error } = useAction();
  const [ack, setAck] = useState(false);
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="accept-ack" />
        <span>
          I read the scope, the limitations and the fixed price of <strong className="tabular">{amountLabel}</strong>. I understand payment
          pays for running the bounded test, not for a successful result.
        </span>
      </label>
      <button
        type="button"
        className={btn.primary}
        disabled={!ack || pending}
        data-testid="accept-contract"
        onClick={() => void run(`/api/proof-contracts/${contractId}/accept`, { scopeHash, acknowledge: true })}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Accept this exact version
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RetestForm({ contractId, hasWrite, hasApproval }: { contractId: string; hasWrite: boolean; hasApproval: boolean }) {
  const { run, pending, error } = useAction();
  const [grant, setGrant] = useState(!hasWrite);
  const [approval, setApproval] = useState(true);
  const [reason, setReason] = useState("Buyer admin granted contacts.write (simulated) and an approval gate was enabled.");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run("/api/proof-runs", { contractId, grantWriteScope: grant, enableApproval: approval, reason });
      }}
    >
      <p className="text-sm text-ink-3">
        Record a fictional, validated change to the simulated environment, then queue a new run under the same paid contract.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={grant || hasWrite} disabled={hasWrite} onChange={(e) => setGrant(e.target.checked)} />
        <span className="font-mono text-[12px]">contacts.write</span> granted by the buyer&apos;s CRM admin (simulated)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
        Human approval gate enabled {hasApproval ? "(already on)" : ""}
      </label>
      <input aria-label="Reason for the change" className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="submit" className={cx(btn.primary)} disabled={pending} data-testid="queue-retest">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Record change and queue retest
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </form>
  );
}
