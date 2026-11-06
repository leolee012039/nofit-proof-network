import { NextResponse } from "next/server";
import { currentActor, readJson, route, stringField } from "@/lib/http";
import { cancelContract } from "@/lib/services/contracts";

export const POST = route<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const reason = stringField(await readJson(req), "reason", { max: 500 });
    const c = await cancelContract(await currentActor(), id, { reason });
    return NextResponse.json({ id: c.id, status: c.status });
  },
  { mutation: true },
);
