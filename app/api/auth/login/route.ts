import { NextResponse } from "next/server";
import { loadActor } from "@/lib/auth/actor";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { getAppBaseUrl } from "@/lib/config";
import { DEMO_PERSONAS } from "@/lib/demo/fixtures";
import { AppError } from "@/lib/domain/errors";
import { readJson, route, stringField } from "@/lib/http";

/** Demo sign-in: only the fictional personas can be selected. No passwords exist in this demo. */
export const POST = route(
  async (req) => {
    const userId = stringField(await readJson(req), "userId", { required: true, max: 64 });
    const persona = DEMO_PERSONAS.find((p) => p.userId === userId);
    if (!persona) throw new AppError("VALIDATION", "Unknown demo persona.");
    const actor = await loadActor(persona.userId);
    if (!actor) throw new AppError("NOT_FOUND", "Demo persona is not seeded. Reset the demo.");
    const res = NextResponse.json({ ok: true, actor: { name: actor.displayName, org: actor.orgName, role: actor.role } });
    res.cookies.set(SESSION_COOKIE, signSession(actor.userId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && getAppBaseUrl().startsWith("https://"),
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  },
  { mutation: true },
);
