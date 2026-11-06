/** Seeds the fictional base world (idempotent). `--reset` wipes demo data first. */
import { getDb } from "../lib/db/client";
import { ensureSeeded, resetDemoData } from "../lib/demo/seed";

async function main() {
  const db = await getDb();
  if (process.argv.includes("--reset")) {
    await resetDemoData(db);
    console.log("Demo data reset to the fictional base world.");
    return;
  }
  const inserted = await ensureSeeded(db);
  console.log(inserted ? "Seeded fictional demo data." : "Already seeded; nothing to do.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
