export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "PAYMENT_NOT_CONFIGURED"
  | "PAYMENT_PROVIDER_ERROR"
  | "PAYMENT_VERIFICATION_FAILED"
  | "PAYMENT_NOT_APPROVED"
  | "PAYMENT_REQUIRED"
  | "WEBHOOK_REJECTED";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  PAYMENT_NOT_CONFIGURED: 503,
  PAYMENT_PROVIDER_ERROR: 502,
  PAYMENT_VERIFICATION_FAILED: 422,
  PAYMENT_NOT_APPROVED: 409,
  PAYMENT_REQUIRED: 402,
  WEBHOOK_REJECTED: 401,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
