import { randomBytes } from "node:crypto";

/**
 * Runtime configuration. PayPal is SANDBOX ONLY and fails closed: any
 * production indicator disables every payment path, including fixture mode.
 */

const SANDBOX_HOSTS = new Set(["api-m.sandbox.paypal.com", "api.sandbox.paypal.com"]);

export type PaymentMode =
  | { kind: "sandbox"; baseUrl: string; clientId: string; clientSecret: string; webhookId?: string; merchantId?: string }
  | { kind: "fixture"; reason: string }
  | { kind: "disabled"; reason: string };

export function getPaymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  const paypalEnv = (env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();
  if (paypalEnv !== "sandbox") {
    return { kind: "disabled", reason: `PAYPAL_ENV=${paypalEnv} is not allowed. This build only supports sandbox.` };
  }

  const baseUrl = (env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com").trim().replace(/\/+$/, "");
  let host: string;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") throw new Error("not https");
    host = parsed.host;
  } catch {
    return { kind: "disabled", reason: "PAYPAL_BASE_URL is not a valid https URL." };
  }
  if (!SANDBOX_HOSTS.has(host)) {
    return { kind: "disabled", reason: `PAYPAL_BASE_URL host ${host} is not a PayPal sandbox host. Refusing to run.` };
  }

  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    return {
      kind: "sandbox",
      baseUrl,
      clientId,
      clientSecret,
      webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || undefined,
      merchantId: env.PAYPAL_MERCHANT_ID?.trim() || undefined,
    };
  }
  if (clientId || clientSecret) {
    return { kind: "disabled", reason: "Only one of PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET is set." };
  }
  if (flagEnabled(env.FIXTURE_PAYMENTS, env)) {
    return { kind: "fixture", reason: "PayPal sandbox credentials are not configured." };
  }
  return {
    kind: "disabled",
    reason:
      "PayPal sandbox credentials are not configured, and fixture payments are off (they default on only for localhost; set FIXTURE_PAYMENTS=enabled to allow them elsewhere).",
  };
}

/**
 * Hosted demo only: the fictional seller's PayPal Sandbox merchant ID, preset on its organization
 * whenever the world is seeded or reset (a free instance reseeds on every start). It lives in the
 * host's settings, never in the repository. Values that are not 13 letters/digits are ignored.
 */
export function getDemoSellerMerchantId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const id = env.DEMO_SELLER_PAYPAL_MERCHANT_ID?.trim().toUpperCase();
  return id && /^[A-Z0-9]{13}$/.test(id) ? id : undefined;
}

export type AiMode = { kind: "anthropic"; apiKey: string; model: string } | { kind: "offline-fixture"; reason: string };

export function getAiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  const provider = (env.AI_PROVIDER ?? "offline-fixture").trim().toLowerCase();
  if (provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return { kind: "offline-fixture", reason: "AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty." };
    return { kind: "anthropic", apiKey, model: env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5" };
  }
  return { kind: "offline-fixture", reason: "AI_PROVIDER is offline-fixture (no network calls)." };
}

const globalForSecret = globalThis as unknown as { __nofitDevSecret?: string };

export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === "production" && !isLocalDeployment(env)) {
    throw new Error("SESSION_SECRET (32+ chars) is required for non-localhost production deployments.");
  }
  // Local runs: ephemeral per-process secret (sessions reset on restart).
  globalForSecret.__nofitDevSecret ??= randomBytes(32).toString("hex");
  return globalForSecret.__nofitDevSecret;
}

export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  // RENDER_EXTERNAL_URL is set by Render to the service's public onrender.com URL (see render.yaml).
  return (env.APP_BASE_URL?.trim() || env.RENDER_EXTERNAL_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * True when the app is served from localhost (single-user local run). A production
 * build without an explicit APP_BASE_URL may be a real host, so it fails closed:
 * `npm start` on a laptop needs APP_BASE_URL=http://localhost:3000 (as in .env.example).
 */
export function isLocalDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production" && !env.APP_BASE_URL?.trim()) return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(getAppBaseUrl(env));
}

/**
 * Demo conveniences (fixture payments, global demo reset) default ON only for
 * localhost. Any other deployment must opt in explicitly with "enabled".
 */
function flagEnabled(value: string | undefined, env: NodeJS.ProcessEnv): boolean {
  const v = value?.trim().toLowerCase();
  if (v === "enabled") return true;
  if (v === "disabled") return false;
  return isLocalDeployment(env);
}

export function isDemoResetEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagEnabled(env.DEMO_RESET, env);
}
