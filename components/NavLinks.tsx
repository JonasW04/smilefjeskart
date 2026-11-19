"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export const NAV = [
  { href: "/", label: "Kart", emoji: "🗺️" },
  { href: "/siste", label: "Ferskt", emoji: "🥐" },
  { href: "/kommune", label: "Kommuner", emoji: "📍" },
  { href: "/analyse", label: "Analyse", emoji: "📊" },
  { href: "/prediksjon", label: "Spåkula", emoji: "🔮" },
  { href: "/varsling", label: "Varsling", emoji: "🔔" },
  { href: "/om", label: "Om", emoji: "💡" },
] as const;

/**
 * Menyen er én rad på alle skjermbredder. Når den ikke får plass (under lg), kan den rulles sidelengs,
 * og høyre kant tones ut så det synes at det er mer. Padding rundt lenkene gir plass til fokusringen,
 * som ellers ville blitt klippet av rullefeltet.
 */
export default function NavLinks() {
  const path = usePathname();
  const ref = useRef<HTMLUListElement>(null);

  // Rull den aktive lenken inn i synsfeltet, uten å flytte resten av siden (scrollIntoView ville gjort det).
  useEffect(() => {
    const ul = ref.current;
    const aktiv = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !aktiv || ul.scrollWidth <= ul.clientWidth) return;
    ul.scrollLeft = aktiv.offsetLeft - (ul.clientWidth - aktiv.offsetWidth) / 2;
  }, [path]);

  return (
    <ul
      ref={ref}
      className="relative -my-1.5 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain p-1.5 [scrollbar-width:none] sm:gap-2 max-lg:pr-6 max-lg:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] [&::-webkit-scrollbar]:hidden [&>li]:shrink-0 [&>li:first-child]:ml-auto"
    >
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
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
