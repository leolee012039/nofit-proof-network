import { NextResponse } from "next/server";
import { currentActor, readJson, route } from "@/lib/http";
import { overrideAssessment } from "@/lib/services/assessments";

export const POST = route<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const updated = await overrideAssessment(await currentActor(), id, await readJson(req));
    return NextResponse.json({ assessmentId: updated.id, override: updated.overrideJson });
  },
  { mutation: true },
);
