"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Kart", emoji: "🗺️" },
  { href: "/analyse", label: "Analyse", emoji: "📊" },
  { href: "/om", label: "Om", emoji: "💡" },
] as const;

export default function NavLinks() {
  const path = usePathname();
  return (
    <ul className="flex items-center gap-1.5 sm:gap-2">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
                active
                  ? "border-line bg-ink text-paper"
                  : "border-transparent text-ink hover:border-line hover:bg-card"
              }`}
            >
              <span aria-hidden>{n.emoji}</span>
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
