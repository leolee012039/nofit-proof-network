import { NextResponse } from "next/server";
import { currentActor, readJson, route, stringField } from "@/lib/http";
import { resetDemo } from "@/lib/services/demo";

export const POST = route(
  async (req) => {
    const mode = stringField(await readJson(req), "mode", { max: 16 });
    return NextResponse.json(await resetDemo(await currentActor(), mode === "storyline" ? "storyline" : "clean"));
  },
  { mutation: true },
);
