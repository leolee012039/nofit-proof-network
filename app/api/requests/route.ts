import { NextResponse } from "next/server";
import { currentActor, readJson, route } from "@/lib/http";
import { listRequests, submitBuyerRequest } from "@/lib/services/requests";

export const GET = route(async () => NextResponse.json({ requests: await listRequests(await currentActor()) }));

export const POST = route(
  async (req) => {
    const result = await submitBuyerRequest(await currentActor(), await readJson(req));
    return NextResponse.json(
      {
        requestId: result.request.id,
        assessmentId: result.assessment?.id ?? null,
        fitStatus: result.assessment?.fitStatus ?? null,
        proofContractId: result.contract?.id ?? null,
        assessmentError: result.assessmentError,
      },
      { status: 201 },
    );
  },
  { mutation: true },
);
