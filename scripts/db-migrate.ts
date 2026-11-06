/**
 * Applies migrations. With DATABASE_URL: real Postgres. Without: the embedded
 * PGlite database in PGLITE_DATA_DIR (which also migrates itself on first boot).
 */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const migrationsFolder = path.join(process.cwd(), "db", "migrations");
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1 });
    await migrate(drizzle({ client }), { migrationsFolder });
    await client.end();
    console.log("Migrations applied to DATABASE_URL.");
    return;
  }
  const { getDb } = await import("../lib/db/client");
  await getDb();
  console.log(`Migrations applied to embedded PGlite (${process.env.PGLITE_DATA_DIR || ".data/pglite"}).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
