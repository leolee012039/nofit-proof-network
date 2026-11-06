/** Postgres unique violation (e.g. the "one live order per contract" index). Drizzle may wrap the driver error in `cause`. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
