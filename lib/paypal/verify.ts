import { decimalStringToMinor } from "@/lib/money";
import type { PayPalOrder } from "./types";

export interface ExpectedPayment {
  paypalOrderId: string;
  contractId: string;
  customId: string;
  amountMinor: number;
  currency: string;
  merchantId?: string;
}

export interface VerificationCheck {
  name: string;
  ok: boolean;
  expected: string;
  actual: string;
}

export interface CaptureVerification {
  ok: boolean;
  captureId: string | null;
  captureStatus: string | null;
  checks: VerificationCheck[];
}

/**
 * Verifies a provider order against the server-side contract. Only a passing
 * verification with capture status COMPLETED may mark a contract PAID.
 * Amounts are compared as integer minor units; client input is never consulted.
 */
export function verifyCapturedOrder(order: PayPalOrder, expected: ExpectedPayment): CaptureVerification {
  const checks: VerificationCheck[] = [];
  const check = (name: string, ok: boolean, exp: unknown, act: unknown) =>
    checks.push({ name, ok, expected: String(exp), actual: String(act ?? "missing") });

  check("order_id", order.id === expected.paypalOrderId, expected.paypalOrderId, order.id);
  check("order_status", order.status === "COMPLETED", "COMPLETED", order.status);
  check("single_purchase_unit", order.purchase_units.length === 1, 1, order.purchase_units.length);

  const unit = order.purchase_units[0];
  check("reference_id", unit?.reference_id === expected.contractId, expected.contractId, unit?.reference_id);

  const captures = unit?.payments?.captures ?? [];
  check("single_capture", captures.length === 1, 1, captures.length);
  const capture = captures[0];
  const customId = capture?.custom_id ?? unit?.custom_id;
  check("custom_id", customId === expected.customId, expected.customId, customId);

  const captureMinor = decimalStringToMinor(capture?.amount?.value);
  check("capture_amount_minor", captureMinor === expected.amountMinor, expected.amountMinor, captureMinor);
  check("capture_currency", capture?.amount?.currency_code === expected.currency, expected.currency, capture?.amount?.currency_code);

  if (unit?.amount) {
    const unitMinor = decimalStringToMinor(unit.amount.value);
    check("order_amount_minor", unitMinor === expected.amountMinor, expected.amountMinor, unitMinor);
    check("order_currency", unit.amount.currency_code === expected.currency, expected.currency, unit.amount.currency_code);
  }
  if (expected.merchantId) {
    check("payee_merchant_id", unit?.payee?.merchant_id === expected.merchantId, expected.merchantId, unit?.payee?.merchant_id);
  } else {
    // Recorded explicitly so the ledger shows the payee was NOT checked (set PAYPAL_MERCHANT_ID to enforce).
    check("payee_merchant_id", true, "(not configured: check skipped)", unit?.payee?.merchant_id);
  }

  const knownStatus = ["COMPLETED", "PENDING", "DECLINED", "FAILED"].includes(capture?.status ?? "");
  check("capture_status_known", knownStatus, "COMPLETED|PENDING|DECLINED|FAILED", capture?.status);

  return {
    ok: checks.every((c) => c.ok),
    captureId: capture?.id ?? null,
    captureStatus: capture?.status ?? null,
    checks,
  };
}
