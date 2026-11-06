import { notFound, redirect } from "next/navigation";
import type { Actor } from "@/lib/auth/actor";
import { isAppError } from "@/lib/domain/errors";
import { currentActor } from "@/lib/http";

export async function pageActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Maps service errors to page outcomes: 404 → notFound(), 403 → a readable forbidden result. */
export async function guard<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    if (isAppError(err) && (err.code === "FORBIDDEN" || err.code === "UNAUTHENTICATED")) return { ok: false, message: err.message };
    throw err;
  }
}
