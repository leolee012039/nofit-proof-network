import { NextResponse } from "next/server";
import { currentActor, readJson, route } from "@/lib/http";
import { addKnowledgeVersion, getKnowledgeBase } from "@/lib/services/knowledge";

export const GET = route(async () => NextResponse.json(await getKnowledgeBase(await currentActor())));

export const POST = route(
  async (req) => {
    const row = await addKnowledgeVersion(await currentActor(), await readJson(req));
    return NextResponse.json({ id: row.id, docKey: row.docKey, version: row.version }, { status: 201 });
  },
  { mutation: true },
);
