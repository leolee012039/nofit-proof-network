import { NextResponse } from "next/server";
import { currentActor, readJson, route } from "@/lib/http";
import { setPayoutAccount } from "@/lib/services/payout";

export const POST = route(async (req) => NextResponse.json(await setPayoutAccount(await currentActor(), await readJson(req, 4 * 1024))), {
  mutation: true,
});
