import { profilesFixture } from "@/lib/demo/fixtures";

const SYSTEM_ACTORS: Record<string, string> = {
  "agent:fit-engine": "System Agent",
  "system:payment-service": "Payment service",
  "system:paypal-webhook": "PayPal webhook",
};

/** Display name for a user or system actor id (demo personas only; unknown ids fall back to the id). */
export function personName(id: string | null | undefined): string {
  if (!id) return "—";
  return profilesFixture.find((p) => p.userId === id)?.displayName ?? SYSTEM_ACTORS[id] ?? id;
}
