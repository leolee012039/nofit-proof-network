import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { currentActor } from "@/lib/http";
import { getSystemStatus } from "@/lib/services/system";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return (
    <AppShell actor={actor} status={getSystemStatus()}>
      {children}
    </AppShell>
  );
}
