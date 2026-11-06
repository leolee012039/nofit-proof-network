/**
 * In-memory stand-in for the PayPal Sandbox REST API, injected as `fetchImpl`
 * into the real SandboxGateway so the full HTTP contract is exercised offline.
 * It is a TEST DOUBLE only and never used by the running app.
 */
interface FakeOrder {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED";
  referenceId: string;
  customId: string;
  amount: { currency_code: string; value: string };
  /** The payee the order was created with; PayPal echoes it, or the app's own merchant when none was named. */
  payeeMerchantId?: string;
  captureId?: string;
  captureStatus?: string;
}

export interface FakeBehavior {
  captureStatus: "COMPLETED" | "PENDING" | "DECLINED";
  /** Provider-side tampering to prove server verification catches it. */
  reportAmount?: string;
  reportCurrency?: string;
  reportPayeeMerchantId?: string;
  /** Capture succeeds at the provider but every HTTP response (incl. idempotent replays) is lost. */
  loseCaptureResponse?: boolean;
  /** Only the first capture response is lost; an idempotent retry gets the stored result. */
  loseFirstCaptureResponse?: boolean;
  verifyWebhook: "SUCCESS" | "FAILURE";
  /** Number of upcoming GET order calls that fail with a 500 (all retries included). */
  failGetOrders?: number;
  /** HTTP status the signature-verification endpoint answers with (e.g. 500 outage, 400 bad envelope). */
  verifyHttpStatus?: number;
}

export class FakePayPal {
  readonly orders = new Map<string, FakeOrder>();
  private readonly idempotent = new Map<string, unknown>();
  readonly calls: Array<{ method: string; path: string; body?: string }> = [];
  captureCalls = 0;
  tokenIssued = 0;
  private seq = 0;
  private token = "A21-fake-access-token";
  behavior: FakeBehavior = { captureStatus: "COMPLETED", verifyWebhook: "SUCCESS" };

  approve(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`no fake order ${orderId}`);
    if (o.status === "CREATED") o.status = "APPROVED";
  }

  /** PayPal revokes the current access token early: the next call with it gets a 401. */
  revokeToken() {
    this.token = `A21-fake-access-token-r${this.tokenIssued}`;
  }

  /** Provider-side settlement of a PENDING capture (e.g. later COMPLETED). */
  settle(orderId: string, status: "COMPLETED" | "DECLINED") {
    const o = this.orders.get(orderId)!;
    o.captureStatus = status;
  }

  private repr(o: FakeOrder) {
    const amount = {
      currency_code: this.behavior.reportCurrency ?? o.amount.currency_code,
      value: this.behavior.reportAmount ?? o.amount.value,
    };
    return {
      id: o.id,
      status: o.status,
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: o.referenceId,
          custom_id: o.customId,
          amount,
          payee: { merchant_id: this.behavior.reportPayeeMerchantId ?? o.payeeMerchantId ?? "FAKEMERCHANT1" },
          payments: o.captureId
            ? { captures: [{ id: o.captureId, status: o.captureStatus, amount, custom_id: o.customId, final_capture: true }] }
            : undefined,
        },
      ],
      links: [{ href: `https://www.sandbox.paypal.com/checkoutnow?token=${o.id}`, rel: "payer-action", method: "GET" }],
    };
  }

  private json(status: number, body: unknown) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    this.calls.push({ method, path: url.pathname, body });
    const requestId = headers.get("PayPal-Request-Id");

    if (url.pathname === "/v1/oauth2/token") {
      if (!headers.get("Authorization")?.startsWith("Basic ")) return this.json(401, { error: "invalid_client" });
      this.tokenIssued++;
      return this.json(200, { access_token: this.token, expires_in: 3600 });
    }
    if (headers.get("Authorization") !== `Bearer ${this.token}`) return this.json(401, { name: "AUTHENTICATION_FAILURE" });

    if (url.pathname === "/v2/checkout/orders" && method === "POST") {
      if (requestId && this.idempotent.has(requestId)) return this.json(200, this.idempotent.get(requestId));
      const req = JSON.parse(body ?? "{}");
      const unit = req.purchase_units[0];
      const o: FakeOrder = {
        id: `5O${String(++this.seq).padStart(15, "0")}`,
        status: "CREATED",
        referenceId: unit.reference_id,
        customId: unit.custom_id,
        amount: unit.amount,
        payeeMerchantId: unit.payee?.merchant_id,
      };
      this.orders.set(o.id, o);
      const r = this.repr(o);
      if (requestId) this.idempotent.set(requestId, r);
      return this.json(201, r);
    }

    const m = url.pathname.match(/^\/v2\/checkout\/orders\/([^/]+)(\/capture)?$/);
    if (m) {
      const o = this.orders.get(decodeURIComponent(m[1]));
      if (!o) return this.json(404, { name: "RESOURCE_NOT_FOUND", details: [{ issue: "INVALID_RESOURCE_ID" }] });
      if (!m[2]) {
        if (this.behavior.failGetOrders && this.behavior.failGetOrders > 0) {
          this.behavior.failGetOrders--;
          return this.json(500, { name: "INTERNAL_SERVER_ERROR" });
        }
        return this.json(200, this.repr(o));
      }
      if (requestId && this.idempotent.has(`cap:${requestId}`)) {
        if (this.behavior.loseCaptureResponse) throw new TypeError("fetch failed (simulated lost response)");
        return this.json(201, this.idempotent.get(`cap:${requestId}`));
      }
      if (o.status === "COMPLETED") return this.json(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_ALREADY_CAPTURED" }] });
      if (o.status !== "APPROVED") return this.json(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED" }] });
      this.captureCalls++;
      o.status = "COMPLETED";
      o.captureId = `CAP${String(this.seq).padStart(14, "0")}`;
      o.captureStatus = this.behavior.captureStatus;
      const r = this.repr(o);
      if (requestId) this.idempotent.set(`cap:${requestId}`, r);
      if (this.behavior.loseCaptureResponse || this.behavior.loseFirstCaptureResponse)
        throw new TypeError("fetch failed (simulated lost response)");
      return this.json(201, r);
    }

    if (url.pathname === "/v1/notifications/verify-webhook-signature") {
      if (this.behavior.verifyHttpStatus) return this.json(this.behavior.verifyHttpStatus, { name: "SIMULATED_FAILURE" });
      const parsed = JSON.parse(body ?? "{}");
      if (!parsed.webhook_id || !parsed.webhook_event) return this.json(400, { name: "VALIDATION_ERROR" });
      return this.json(200, { verification_status: this.behavior.verifyWebhook });
    }
    return this.json(404, { name: "NOT_FOUND" });
  };
}

export function webhookEvent(id: string, type: string, resource: Record<string, unknown>) {
  return JSON.stringify({
    id,
    event_version: "1.0",
    create_time: "2026-10-26T10:00:00Z",
    resource_type: "capture",
    event_type: type,
    summary: type,
    resource,
  });
}

export const SIGNED_HEADERS = {
  transmissionId: "69cd13f0-d67a-11e5-baa3-778b53f4ae55",
  transmissionTime: "2026-10-26T10:00:00Z",
  transmissionSig: "fake-signature-base64",
  certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-1d93a270",
  authAlgo: "SHA256withRSA",
};
