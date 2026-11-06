import { NextResponse } from "next/server";
import { currentActor, route } from "@/lib/http";
import { executeProofRun } from "@/lib/services/proofs";

export const POST = route<{ params: Promise<{ id: string }> }>(
  async (_req, ctx) => {
    const { id } = await ctx.params;
    const { run, outcome, reassessment } = await executeProofRun(await currentActor(), id);
    return NextResponse.json({ id: run.id, status: run.status, artifactDigest: run.artifactDigest, outcomeId: outcome.id, reassessment });
  },
  { mutation: true },
);
