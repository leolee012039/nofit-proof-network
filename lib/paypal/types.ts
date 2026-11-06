import { z } from "zod";

const Money = z.object({ currency_code: z.string(), value: z.string() });

export const PayPalCapture = z
  .object({
    id: z.string(),
    status: z.string(),
    amount: Money.optional(),
    custom_id: z.string().optional(),
    final_capture: z.boolean().optional(),
    status_details: z.object({ reason: z.string().optional() }).optional(),
    supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().optional() }).optional() }).optional(),
  })
  .passthrough();
export type PayPalCapture = z.infer<typeof PayPalCapture>;

export const PayPalOrder = z
  .object({
    id: z.string(),
    status: z.string(),
    intent: z.string().optional(),
    purchase_units: z
      .array(
        z
          .object({
            reference_id: z.string().optional(),
            custom_id: z.string().optional(),
            amount: Money.optional(),
            payee: z.object({ merchant_id: z.string().optional(), email_address: z.string().optional() }).optional(),
            payments: z.object({ captures: z.array(PayPalCapture).optional() }).optional(),
          })
          .passthrough(),
      )
      .default([]),
    links: z.array(z.object({ href: z.string(), rel: z.string(), method: z.string().optional() })).default([]),
  })
  .passthrough();
export type PayPalOrder = z.infer<typeof PayPalOrder>;

export interface CreateOrderInput {
  requestId: string;
  referenceId: string;
  customId: string;
  description: string;
  amountValue: string;
  currency: string;
  returnUrl?: string;
  cancelUrl?: string;
  /** The seller's PayPal merchant ID; when set, PayPal pays the seller directly instead of the app's own account. */
  payeeMerchantId?: string;
}

export interface WebhookHeaders {
  transmissionId: string | null;
  transmissionTime: string | null;
  transmissionSig: string | null;
  certUrl: string | null;
  authAlgo: string | null;
}

/** Narrow provider interface: identical call sequence for sandbox and fixture. */
export interface PaymentGateway {
  readonly mode: "sandbox" | "fixture";
  createOrder(input: CreateOrderInput): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<PayPalOrder>;
  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder>;
  verifyWebhookSignature(headers: WebhookHeaders, rawBody: string): Promise<{ verified: boolean; method: string; detail?: string }>;
}

export class PayPalApiError extends Error {
  readonly httpStatus: number;
  readonly issue?: string;
  readonly debugId?: string;
  readonly retryable: boolean;

  constructor(message: string, opts: { httpStatus: number; issue?: string; debugId?: string; retryable?: boolean }) {
    super(message);
    this.name = "PayPalApiError";
    this.httpStatus = opts.httpStatus;
    this.issue = opts.issue;
    this.debugId = opts.debugId;
    this.retryable = opts.retryable ?? false;
  }
}
