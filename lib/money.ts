/** Money is always integer minor units. Only two-decimal currencies are supported. */
export const SUPPORTED_CURRENCIES = ["USD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error(`amount must be a non-negative integer in minor units, got ${amountMinor}`);
  }
}

/** 4900 -> "49.00" (the decimal string PayPal expects). */
export function minorToDecimalString(amountMinor: number): string {
  assertMinor(amountMinor);
  const units = Math.floor(amountMinor / 100);
  const cents = amountMinor % 100;
  return `${units}.${cents.toString().padStart(2, "0")}`;
}

/** Strict parse of a provider decimal string: "49.00" -> 4900. Returns null if malformed. */
export function decimalStringToMinor(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [units, fraction = ""] = value.split(".");
  return Number(units) * 100 + Number(fraction.padEnd(2, "0"));
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}
