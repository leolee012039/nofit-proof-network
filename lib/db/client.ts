import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

export type Db = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export type TenantRole = "buyer" | "seller_admin" | "reviewer" | "system_agent";

export interface TenantContext {
  orgId: string;
  userId: string;
  role: TenantRole;
}

const MIGRATIONS_FOLDER = path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");

interface DbState {
  db: Db;
  close: () => Promise<void>;
}

const globalForDb = globalThis as unknown as { __nofitDb?: Promise<DbState> };

async function openPglite(dataDir: string | undefined): Promise<DbState> {
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}

async function openPostgres(url: string): Promise<DbState> {
  const [{ default: postgres }, { drizzle }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js")]);
  const client = postgres(url, { max: 10, prepare: false });
  // Tenant isolation relies on `set local role app_tenant` + RLS: refuse to start when that cannot work.
  const [role] = await client<{ present: boolean; member: boolean; bypass: boolean }[]>`
    select r.rolname is not null as present,
           coalesce(pg_has_role(current_user, r.oid, 'member'), false) as member,
           coalesce(r.rolbypassrls or r.rolsuper, false) as bypass
    from (select 1) as one left join pg_roles r on r.rolname = 'app_tenant'`;
  if (!role?.present || !role.member || role.bypass) {
    await client.end();
    throw new Error(
      !role?.present
        ? "DATABASE_URL: role app_tenant is missing. Run `npm run db:migrate` first."
        : !role.member
          ? "DATABASE_URL: the connecting user cannot SET ROLE app_tenant (grant membership), so tenant isolation cannot run."
          : "DATABASE_URL: role app_tenant bypasses row-level security; tenant isolation would be off. Refusing to start.",
    );
  }
  // Both drivers expose the same PgDatabase query API; the cast keeps one Db type.
  const db = drizzle({ client, schema }) as unknown as Db;
  return { db, close: () => client.end() };
}

/**
 * Default embedded-database location: OUTSIDE the project folder. The Next.js
 * dev server watches the project root, so database writes inside it trigger a
 * recompile-and-refresh loop. One folder per project checkout (path hash).
 */
export function pgliteDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.PGLITE_DATA_DIR?.trim();
  if (configured) return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
  const checkout = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 10);
  return path.join(os.homedir(), ".nofit-proof-network", `pglite-${checkout}`);
}

async function init(): Promise<DbState> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return openPostgres(url);
  const state = await openPglite(pgliteDataDir());
  // Fresh-clone experience: embedded database seeds itself with fictional data.
  const { ensureSeeded } = await import("@/lib/demo/seed");
  await ensureSeeded(state.db);
  return state;
}

export async function getDb(): Promise<Db> {
  if (!globalForDb.__nofitDb) {
    globalForDb.__nofitDb = init().catch((err) => {
      globalForDb.__nofitDb = undefined;
      throw err;
    });
  }
  return (await globalForDb.__nofitDb).db;
}

/** Test helper: in-memory Postgres (PGlite) with all migrations applied. */
export async function createMemoryDb(): Promise<DbState> {
  return openPglite(undefined);
}

/** Test helper: route getDb() to a specific database instance. */
export function setDbForTesting(state: DbState | undefined) {
  globalForDb.__nofitDb = state ? Promise.resolve(state) : undefined;
}

/**
 * Runs `fn` inside a transaction as the restricted `app_tenant` role so Postgres
 * row-level security enforces organization isolation for every statement.
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role app_tenant`);
    await tx.execute(
      sql`select set_config('app.org_id', ${ctx.orgId}, true), set_config('app.role', ${ctx.role}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    );
    return fn(tx);
  });
}

/**
 * Runs `fn` as the table owner (bypasses RLS). Only for trusted server paths:
 * verified payment finalization, webhook processing, seeding and migrations.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}
