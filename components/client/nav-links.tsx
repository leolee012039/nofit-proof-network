"use client";

import {
  ArrowLeftRight,
  BookOpenText,
  FileSignature,
  GitCompareArrows,
  History,
  LayoutDashboard,
  PlusCircle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/assessments/new", label: "New Assessment", icon: PlusCircle, roles: ["buyer"] },
  { href: "/contracts", label: "Proof Contracts", icon: FileSignature },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/outcomes", label: "Outcome Memory", icon: History },
  { href: "/knowledge", label: "Knowledge Base", icon: BookOpenText, roles: ["seller_admin", "reviewer"] },
  { href: "/replay", label: "Decision Replay", icon: GitCompareArrows },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** The case-file index: the open drawer is inked, its icon marked in evidence yellow. */
export function NavLinks({ role, onNavigate }: { role: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-0.5">
      {NAV.filter((n) => !n.roles || n.roles.includes(role)).map((n) => {
        const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href));
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-[3px] px-3 py-2 text-sm transition-colors duration-150",
              active ? "bg-ink font-semibold text-white" : "text-ink-2 hover:bg-paper hover:text-ink",
            )}
          >
            <Icon className={cx("size-4 shrink-0", active ? "text-marker" : "text-ink-3")} aria-hidden />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
