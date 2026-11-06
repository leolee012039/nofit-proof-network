import { NextResponse } from "next/server";
import { currentActor, readJson, route } from "@/lib/http";
import { draftIntake } from "@/lib/services/intake";

export const POST = route(
  async (req) => {
    const draft = await draftIntake(await currentActor(), await readJson(req, 16 * 1024));
    return NextResponse.json({ draft });
  },
  { mutation: true },
);
