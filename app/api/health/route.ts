import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { route } from "@/lib/http";
import { getSystemStatus } from "@/lib/services/system";

export const GET = route(async () => {
  const db = await getDb();
  await db.execute(sql`select 1`);
  const s = getSystemStatus();
  return NextResponse.json({ ok: true, payment: s.payment.kind, ai: s.ai.kind, database: s.database });
});
