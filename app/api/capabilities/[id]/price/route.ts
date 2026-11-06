import { NextResponse } from "next/server";
import { currentActor, readJson, route } from "@/lib/http";
import { updateCapabilityPrice } from "@/lib/services/knowledge";

export const POST = route<{ params: Promise<{ id: string }> }>(
  async (req, ctx) => {
    const { id } = await ctx.params;
    const next = await updateCapabilityPrice(await currentActor(), id, await readJson(req));
    return NextResponse.json({ id: next.id, version: next.version, basePriceMinor: next.basePriceMinor });
  },
  { mutation: true },
);
