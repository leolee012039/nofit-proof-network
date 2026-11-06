import { NextResponse } from "next/server";
import { booleanField, currentActor, readJson, route, stringField } from "@/lib/http";
import { queueRetest } from "@/lib/services/proofs";

/** Queues a retest under a paid contract after a recorded (simulated) environment change. */
export const POST = route(
  async (req) => {
    const body = await readJson(req);
    const run = await queueRetest(await currentActor(), stringField(body, "contractId", { required: true, max: 64 }), {
      grantWriteScope: booleanField(body, "grantWriteScope"),
      enableApproval: booleanField(body, "enableApproval"),
      reason: stringField(body, "reason", { max: 500 }),
    });
    return NextResponse.json({ id: run.id, runNumber: run.runNumber, status: run.status }, { status: 201 });
  },
  { mutation: true },
);
