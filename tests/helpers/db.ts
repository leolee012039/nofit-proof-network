import { createMemoryDb, setDbForTesting } from "@/lib/db/client";
import { loadActor, type Actor } from "@/lib/auth/actor";
import { ensureSeeded } from "@/lib/demo/seed";
import { USER } from "@/lib/demo/fixtures";
import { setGatewayForTesting } from "@/lib/paypal/gateway";

/** Fresh in-memory Postgres (PGlite) with migrations, RLS and fictional seed data. */
export async function setupTestDb() {
  const state = await createMemoryDb();
  await ensureSeeded(state.db);
  setDbForTesting(state);
  setGatewayForTesting(undefined);
  return state;
}

export async function actors(): Promise<Record<"buyer" | "seller" | "reviewer" | "otherBuyer" | "otherSeller", Actor>> {
  const get = async (id: string) => {
    const a = await loadActor(id);
    if (!a) throw new Error(`missing ${id}`);
    return a;
  };
  return {
    buyer: await get(USER.maya),
    seller: await get(USER.ravi),
    reviewer: await get(USER.reviewer),
    otherBuyer: await get(USER.iris),
    otherSeller: await get(USER.hana),
  };
}
