import { PayPalApiError, PayPalOrder, type CreateOrderInput, type PaymentGateway, type WebhookHeaders } from "./types";

/**
 * PayPal REST (Orders v2) client for the SANDBOX environment only. Server-side;
 * the client secret never leaves this module. `fetchImpl` is injectable so the
 * full HTTP contract can be exercised in tests without network access.
 */
export interface SandboxConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class SandboxGateway implements PaymentGateway {
  readonly mode = "sandbox" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly cfg: SandboxConfig) {
    if (!/^https:\/\/api(-m)?\.sandbox\.paypal\.com$/.test(cfg.baseUrl)) {
      throw new Error("SandboxGateway refuses non-sandbox PayPal hosts");
    }
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const res = await this.send(
      `${this.cfg.baseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      },
      true,
    );
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new PayPalApiError("PayPal OAuth response had no access_token", { httpStatus: res.status });
    this.token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000 };
    return json.access_token;
  }

  /**
   * Runs an authenticated call. A 401 on a cached token (revoked or rotated before its
   * expiry) clears it and retries once with a fresh one; PayPal rejected that request
   * before processing it, so the retry cannot double-apply anything.
   */
  private async authed(call: (token: string) => Promise<Response>): Promise<Response> {
    const wasCached = this.token !== null && this.token.expiresAt > Date.now() + 60_000;
    try {
      return await call(await this.accessToken());
    } catch (err) {
      if (!wasCached || !(err instanceof PayPalApiError) || err.httpStatus !== 401) throw err;
      this.token = null;
      return call(await this.accessToken());
    }
  }

  /** Sends with timeout + bounded exponential backoff on network errors, 429 and 5xx. */
  private async send(url: string, init: RequestInit, retrySafe: boolean): Promise<Response> {
    const attempts = retrySafe ? (this.cfg.maxAttempts ?? 3) : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000) });
        if (res.ok) return res;
        const body = (await res.json().catch(() => ({}))) as {
          name?: string;
          message?: string;
          debug_id?: string;
          details?: Array<{ issue?: string }>;
          error?: string;
        };
        const retryable = res.status === 429 || res.status >= 500;
        const err = new PayPalApiError(body.message ?? body.error ?? `PayPal HTTP ${res.status}`, {
          httpStatus: res.status,
          issue: body.details?.[0]?.issue ?? body.name ?? body.error,
          debugId: body.debug_id,
          retryable,
        });
        if (!retryable || attempt === attempts) throw err;
        lastError = err;
      } catch (err) {
        if (err instanceof PayPalApiError && !err.retryable) throw err;
        lastError = err;
        if (attempt === attempts) break;
      }
      await this.sleep(250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
    }
    if (lastError instanceof PayPalApiError) throw lastError;
    throw new PayPalApiError(`PayPal request failed: ${(lastError as Error)?.message ?? "network error"}`, {
      httpStatus: 0,
      retryable: true,
    });
  }

  private async api(path: string, init: { method: string; body?: unknown; requestId?: string }): Promise<unknown> {
    // GETs and POSTs carrying PayPal-Request-Id are idempotent, so they are safe to retry.
    const retrySafe = init.method === "GET" || Boolean(init.requestId);
    const res = await this.authed((token) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };
      if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
      return this.send(
        `${this.cfg.baseUrl}${path}`,
        {
          method: init.method,
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        },
        retrySafe,
      );
    });
    return res.json();
  }

  async createOrder(input: CreateOrderInput) {
    const body: Record<string, unknown> = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amountValue },
          ...(input.payeeMerchantId ? { payee: { merchant_id: input.payeeMerchantId } } : {}),
        },
      ],
    };
    if (input.returnUrl && input.cancelUrl) {
      body.payment_source = {
        paypal: {
          experience_context: {
            brand_name: "NoFit Proof Network (Sandbox demo)",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      };
    }
    return PayPalOrder.parse(await this.api("/v2/checkout/orders", { method: "POST", body, requestId: input.requestId }));
  }

  async getOrder(orderId: string) {
    return PayPalOrder.parse(await this.api(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" }));
  }

  async captureOrder(orderId: string, requestId: string) {
    return PayPalOrder.parse(
      await this.api(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: {}, requestId }),
    );
  }

  /**
   * Postback verification via /v1/notifications/verify-webhook-signature. The raw
   * body is spliced in byte-for-byte (not re-serialized), as PayPal requires.
   */
  async verifyWebhookSignature(h: WebhookHeaders, rawBody: string) {
    if (!this.cfg.webhookId) return { verified: false, method: "postback", detail: "PAYPAL_WEBHOOK_ID not configured" };
    if (!h.transmissionId || !h.transmissionTime || !h.transmissionSig || !h.certUrl || !h.authAlgo) {
      return { verified: false, method: "postback", detail: "missing PayPal transmission headers" };
    }
    try {
      JSON.parse(rawBody);
    } catch {
      return { verified: false, method: "postback", detail: "body is not JSON" };
    }
    const envelope =
      `{"auth_algo":${JSON.stringify(h.authAlgo)},"cert_url":${JSON.stringify(h.certUrl)},` +
      `"transmission_id":${JSON.stringify(h.transmissionId)},"transmission_sig":${JSON.stringify(h.transmissionSig)},` +
      `"transmission_time":${JSON.stringify(h.transmissionTime)},"webhook_id":${JSON.stringify(this.cfg.webhookId)},` +
      `"webhook_event":${rawBody}}`;
    const res = await this.authed((token) =>
      this.send(
        `${this.cfg.baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: envelope,
        },
        true,
      ),
    );
    const json = (await res.json()) as { verification_status?: string };
    return {
      verified: json.verification_status === "SUCCESS",
      method: "postback",
      detail: `verification_status=${json.verification_status ?? "missing"}`,
    };
  }
}
