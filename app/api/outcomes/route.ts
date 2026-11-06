import { NextResponse } from "next/server";
import { currentActor, route } from "@/lib/http";
import { listOutcomes } from "@/lib/services/outcomes";

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const freshness = q.get("freshness");
  const rows = await listOutcomes(await currentActor(), {
    result: q.get("result") ?? undefined,
    failureClass: q.get("failureClass") ?? undefined,
    version: q.get("version") ?? undefined,
    freshness: freshness === "current" || freshness === "expired" ? freshness : undefined,
  });
  return NextResponse.json({ outcomes: rows });
});
