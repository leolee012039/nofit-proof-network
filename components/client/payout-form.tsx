"use client";

import { useState } from "react";
import { btn, cx, input } from "@/components/ui";
import { useAction } from "./api";

/** The seller's PayPal merchant ID: proof payments name it as payee, so the seller is paid directly. */
export function PayoutForm({ current }: { current: string | null }) {
  const { run, pending, error } = useAction();
  const [value, setValue] = useState(current ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run("/api/payout-account", { merchantId: value });
      }}
    >
      <label className="text-sm">
        <span className="text-xs text-ink-3">PayPal merchant ID</span>
        <input
          className={cx(input, "mt-1 w-56 font-mono uppercase")}
          value={value}
          maxLength={13}
          spellCheck={false}
          autoComplete="off"
          placeholder="13 letters and digits"
          onChange={(e) => setValue(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
          data-testid="payout-merchant-id"
        />
      </label>
      <button type="submit" className={btn.secondary} disabled={pending} data-testid="payout-save">
        {value ? "Save payout account" : "Clear payout account"}
      </button>
      {error ? (
        <p role="alert" className="basis-full text-sm text-red">
          {error}
        </p>
      ) : null}
    </form>
  );
}
