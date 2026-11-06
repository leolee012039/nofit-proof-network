import { NextResponse } from "next/server";
import { currentActor, readJson, route, stringField } from "@/lib/http";
import { approveContract } from "@/lib/services/contracts";

export const POST = route<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const scopeHash = stringField(await readJson(req), "scopeHash", { max: 128 });
    const c = await approveContract(await currentActor(), id, { scopeHash });
    return NextResponse.json({ id: c.id, status: c.status });
  },
  { mutation: true },
);
