import { NextResponse } from "next/server";
import { booleanField, currentActor, readJson, route, stringField } from "@/lib/http";
import { acceptContract } from "@/lib/services/contracts";

export const POST = route<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const c = await acceptContract(await currentActor(), id, {
      scopeHash: stringField(body, "scopeHash", { max: 128 }),
      acknowledge: booleanField(body, "acknowledge"),
    });
    return NextResponse.json({ id: c.id, status: c.status });
  },
  { mutation: true },
);
