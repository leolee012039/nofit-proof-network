"use client";

import { useState } from "react";
import { btn, cx, input } from "@/components/ui";
import { FIT_STATUSES } from "@/lib/domain/states";
import { useAction } from "./api";

export function OverrideForm({ assessmentId, current }: { assessmentId: string; current: string }) {
  const { run, pending, error } = useAction();
  const [status, setStatus] = useState(current);
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(`/api/assessments/${assessmentId}/override`, { status, reason });
      }}
    >
      <p className="text-sm text-ink-3">
        AI output is editable by a human. An override is recorded in the audit log with your reason; deterministic findings stay visible.
      </p>
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <select aria-label="Override status" className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
          {FIT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          aria-label="Reason"
          className={input}
          placeholder="Reason (10+ characters)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <button type="submit" className={cx(btn.secondary)} disabled={pending}>
        Record override
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      ) : null}
    </form>
  );
}
