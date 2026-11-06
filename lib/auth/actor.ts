import { eq } from "drizzle-orm";
import { organizations, profiles } from "@/db/schema";
import { withSystem, type TenantContext } from "@/lib/db/client";
import { AppError } from "@/lib/domain/errors";

export type ActorRole = "buyer" | "seller_admin" | "reviewer";

export interface Actor {
  userId: string;
  orgId: string;
  orgName: string;
  orgRole: "buyer" | "seller";
  role: ActorRole;
  displayName: string;
  title: string;
}

export async function loadActor(userId: string): Promise<Actor | null> {
  const rows = await withSystem((tx) =>
    tx
      .select({ p: profiles, o: organizations })
      .from(profiles)
      .innerJoin(organizations, eq(organizations.id, profiles.organizationId))
      .where(eq(profiles.userId, userId)),
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.p.userId,
    orgId: row.o.id,
    orgName: row.o.name,
    orgRole: row.o.role,
    role: row.p.role,
    displayName: row.p.displayName,
    title: row.p.title,
  };
}

export function tenantOf(actor: Actor): TenantContext {
  return { orgId: actor.orgId, userId: actor.userId, role: actor.role };
}

export function requireRole(actor: Actor | null, roles: ActorRole[]): Actor {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Sign in with a demo account first.");
  if (!roles.includes(actor.role)) {
    throw new AppError("FORBIDDEN", `This action requires role ${roles.join(" or ")}; you are ${actor.role}.`);
  }
  return actor;
}
