import { getPaymentMode, type PaymentMode } from "@/lib/config";
import { AppError } from "@/lib/domain/errors";
import { FixtureGateway } from "./fixture";
import { SandboxGateway } from "./sandbox";
import type { PaymentGateway } from "./types";

const globalForGateway = globalThis as unknown as { __nofitGateway?: PaymentGateway; __nofitGatewayOverride?: PaymentGateway };

/** Test hook: force a gateway (e.g. a SandboxGateway with a fake fetch). */
export function setGatewayForTesting(gateway: PaymentGateway | undefined) {
  globalForGateway.__nofitGatewayOverride = gateway;
}

export function getGateway(mode: PaymentMode = getPaymentMode()): PaymentGateway {
  if (globalForGateway.__nofitGatewayOverride) return globalForGateway.__nofitGatewayOverride;
  if (mode.kind === "disabled") throw new AppError("PAYMENT_NOT_CONFIGURED", mode.reason);
  if (mode.kind === "fixture") {
    if (globalForGateway.__nofitGateway?.mode !== "fixture") globalForGateway.__nofitGateway = new FixtureGateway();
    return globalForGateway.__nofitGateway;
  }
  if (globalForGateway.__nofitGateway?.mode !== "sandbox") {
    globalForGateway.__nofitGateway = new SandboxGateway({
      baseUrl: mode.baseUrl,
      clientId: mode.clientId,
      clientSecret: mode.clientSecret,
      webhookId: mode.webhookId,
    });
  }
  return globalForGateway.__nofitGateway;
}
