import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadActor, type Actor } from "@/lib/auth/actor";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { isUniqueViolation } from "@/lib/db/errors";
import { AppError, isAppError } from "@/lib/domain/errors";

export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = verifySession(token);
  return userId ? loadActor(userId) : null;
}

/** Rejects cross-site browser POSTs (defence in depth on top of SameSite=Lax cookies). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Cross-origin request rejected.");
  } catch (err) {
    if (isAppError(err)) throw err;
    throw new AppError("FORBIDDEN", "Malformed Origin header.");
  }
}

export type JsonBody = Record<string, unknown>;

/** Reads a JSON object body. Oversized bodies are refused before reading; arrays and primitives are a 400. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<JsonBody> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > maxBytes) throw new AppError("VALIDATION", "Request body too large.");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new AppError("VALIDATION", "Request body too large.");
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION", "Body must be JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new AppError("VALIDATION", "Body must be a JSON object.");
  return parsed as JsonBody;
}

/** A string field of a JSON body. A wrong type is a 400, never silently coerced. */
export function stringField(body: JsonBody, key: string, opts: { required: true; max?: number }): string;
export function stringField(body: JsonBody, key: string, opts?: { required?: false; max?: number }): string | undefined;
export function stringField(body: JsonBody, key: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (opts.required) throw new AppError("VALIDATION", `${key} is required.`);
    return undefined;
  }
  if (typeof v !== "string") throw new AppError("VALIDATION", `${key} must be a string.`);
  if (v.length > (opts.max ?? 200)) throw new AppError("VALIDATION", `${key} is too long.`);
  return v;
}

/** A boolean field of a JSON body: only a literal `true` counts as true. */
export function booleanField(body: JsonBody, key: string): boolean {
  const v = body[key];
  if (v !== undefined && v !== null && typeof v !== "boolean") throw new AppError("VALIDATION", `${key} must be a boolean.`);
  return v === true;
}

export function errorResponse(err: unknown) {
  if (isAppError(err)) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  if (isUniqueViolation(err)) {
    // A concurrent request already created the same row (e.g. a double-click): a retryable conflict, not a crash.
    return NextResponse.json(
      { error: { code: "CONFLICT", message: "This was just changed by another request. Refresh and try again." } },
      { status: 409 },
    );
  }
  // Never echo internals; log a short server-side message without request bodies or secrets.
  console.error("[nofit] unhandled error:", err instanceof Error ? `${err.name}: ${err.message.slice(0, 300)}` : "unknown");
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong. Please retry." } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

export function route<C = unknown>(fn: Handler<C>, opts: { mutation?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    try {
      if (opts.mutation) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
