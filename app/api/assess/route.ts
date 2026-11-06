import { NextResponse } from "next/server";
import { currentActor, readJson, route, stringField } from "@/lib/http";
import { reassessRequest } from "@/lib/services/assessments";

/** Re-runs the fit assessment for an existing request (uses current knowledge + outcome memory). */
export const POST = route(
  async (req) => {
    const requestId = stringField(await readJson(req), "requestId", { required: true, max: 64 });
    const { assessment, contract } = await reassessRequest(await currentActor(), requestId);
    return NextResponse.json({ assessmentId: assessment.id, fitStatus: assessment.fitStatus, proofContractId: contract?.id ?? null });
  },
  { mutation: true },
);
