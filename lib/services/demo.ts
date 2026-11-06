import { requireRole, type Actor } from "@/lib/auth/actor";
import { getPaymentMode, isDemoResetEnabled } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";
import { runDemoScenario } from "@/lib/demo/scenario";
import { resetDemoData } from "@/lib/demo/seed";
import { getGateway } from "@/lib/paypal/gateway";

/** Demo convenience for judges: wipe to the fictional base world, optionally replay the storyline. */
export async function resetDemo(actorIn: Actor | null, mode: "clean" | "storyline") {
  requireRole(actorIn, ["buyer", "seller_admin", "reviewer"]);
  if (!isDemoResetEnabled()) throw new AppError("FORBIDDEN", "Demo reset is disabled on this deployment.");
  // Check before wiping: the scripted storyline needs FIXTURE payments, and a failed replay must not leave an empty world.
  if (mode === "storyline" && getGateway().mode !== "fixture" && getPaymentMode().kind !== "fixture") {
    throw new AppError(
      "PAYMENT_NOT_CONFIGURED",
      "The scripted storyline needs FIXTURE payments. With PayPal Sandbox configured, reset to the clean world and pay as the buyer.",
    );
  }
  await resetDemoData(await getDb());
  if (mode === "storyline") await runDemoScenario();
  return { ok: true, mode };
}
