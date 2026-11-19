import Link from "next/link";
import Smiley from "@/components/Smiley";

const SNARVEIER = [
  { href: "/siste", tekst: "🥐 Ferske tilsyn" },
  { href: "/kommune", tekst: "📍 Finn kommunen din" },
  { href: "/varsling", tekst: "🔔 Få varsel på e-post" },
] as const;

/**
 * Det som vises mens kartet lastes. Rendres på serveren (som fallback for den klient-lastede
 * KartApp) og av KartApp selv til kartet er klart, så overgangen er sømløs. Gir forsiden innhold
 * og lenker allerede i første HTML, før JavaScript, kartdata og kartfliser har kommet. Uten
 * JavaScript står den igjen med en forklaring i stedet for telleren.
 */
export default function KartVenter() {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-paper p-5">
      <div className="max-w-md text-center">
        <div role="status" className="kart-venter-status">
          <div className="flex justify-center gap-2" aria-hidden>
            {(["smil", "strek", "sur"] as const).map((k, i) => (
              <span key={k} className="inline-block animate-bounce" style={{ animationDelay: `${i * 150}ms` }}>
                <Smiley kind={k} size={44} />
              </span>
            ))}
          </div>
          <p className="mt-3 font-display text-lg font-extrabold">Teller smilefjes…</p>
        </div>
        {/* Uten JavaScript skjules telleren (globals.css), og dette vises i stedet. */}
        <noscript>
          <p className="font-display text-2xl font-extrabold">Kartet trenger JavaScript 🙈</p>
          <p className="mt-2">
            Slå på JavaScript for å bruke kartet, eller les mer på <a className="link" href="/om">om-siden</a> og i{" "}
            <a className="link" href="/analyse">analysen</a>.
          </p>
        </noscript>
        <p className="mt-2 text-sm text-ink-soft">
          Alle Mattilsynets smilefjestilsyn siden 2016 på ett kart, oppdatert hver morgen.
        </p>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {SNARVEIER.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="inline-flex rounded-full border-2 border-line bg-card px-3 py-1.5 text-sm font-bold hover:bg-accent-soft">
                {s.tekst}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
