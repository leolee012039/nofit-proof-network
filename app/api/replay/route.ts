import { NextResponse } from "next/server";
import { AppError } from "@/lib/domain/errors";
import { currentActor, route } from "@/lib/http";
import { replayDecision } from "@/lib/services/replay";

export const GET = route(async (req) => {
  const requestId = new URL(req.url).searchParams.get("requestId");
  if (!requestId) throw new AppError("VALIDATION", "requestId is required.");
  return NextResponse.json(await replayDecision(await currentActor(), requestId));
});
