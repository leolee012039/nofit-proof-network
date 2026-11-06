"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { btn } from "@/components/ui";
import { postJson } from "./api";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={btn.ghost}
      onClick={async () => {
        await postJson("/api/auth/logout").catch(() => null);
        router.push("/login");
        router.refresh();
      }}
    >
      <LogOut className="size-4" aria-hidden />
      Switch persona
    </button>
  );
}
