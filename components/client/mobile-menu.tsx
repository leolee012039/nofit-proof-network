"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/** Mobile disclosure menu that closes after navigation and on Escape (a plain <details> stays open). */
export function MobileMenu({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details
      ref={ref}
      className="group"
      onKeyDown={(e) => {
        if (e.key === "Escape" && ref.current?.open) {
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
        {brand}
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
          <Menu className="size-5" aria-hidden />
          Menu
        </span>
      </summary>
      {children}
    </details>
  );
}
