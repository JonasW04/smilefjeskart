"use client";

import { useRef, useState, type ReactNode } from "react";

type Tip = { x: number; y: number; linjer: string[] };

/**
 * Hover-tooltip for serverrendrede grafer. Elementer med `data-tip` (linjer skilt med «|»)
 * viser en boble over seg. Første linje er verdien og vises i fet skrift.
 * Tooltips er et tillegg: alle tall finnes også i «Vis tallene»-tabellen under grafen.
 */
export default function Tips({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  function vis(e: React.PointerEvent) {
    const el = e.target instanceof Element ? e.target.closest("[data-tip]") : null;
    const boks = ref.current?.getBoundingClientRect();
    if (!el || !boks) return setTip(null);
    const r = el.getBoundingClientRect();
    // Midt over treffflaten horisontalt, like over pekeren vertikalt. Holdes innenfor grafen
    // så boblen aldri gir horisontal scrolling.
    const x = Math.min(Math.max(r.left + r.width / 2 - boks.left, 70), boks.width - 70);
    const y = Math.max(e.clientY - boks.top - 10, 0);
    setTip({ x, y, linjer: (el.getAttribute("data-tip") ?? "").split("|") });
  }

  return (
    <div
      ref={ref}
      className="relative"
      onPointerMove={vis}
      onPointerDown={vis}
      // På touch blir boblen stående til neste trykk; med mus forsvinner den når pekeren går ut.
      onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}
    >
      {children}
      {tip && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-xl border-2 border-line bg-card px-2.5 py-1.5 text-xs shadow-[2px_2px_0_var(--shadow-ink)]"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          <p className="font-bold text-ink">{tip.linjer[0]}</p>
          {tip.linjer.slice(1).map((l, i) => (
            <p key={i} className="text-ink-soft">
              {l}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
