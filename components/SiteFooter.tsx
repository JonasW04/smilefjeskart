import Link from "next/link";
import Smiley from "./Smiley";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t-2 border-line bg-paper-2">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <div className="flex items-center gap-1" aria-hidden>
            <Smiley kind="smil" size={22} />
            <Smiley kind="strek" size={22} />
            <Smiley kind="sur" size={22} />
          </div>
          <p className="max-w-prose text-ink-soft">
            Smilefjeskartet viser Mattilsynets tilsynsresultater for serveringssteder. Vi er{" "}
            <strong className="text-ink">ikke tilknyttet Mattilsynet</strong>. Dataene oppdateres hver morgen.
          </p>
          <p className="text-ink-soft">
            Data:{" "}
            <a className="link" href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9" target="_blank" rel="noopener noreferrer">
              Mattilsynet
            </a>{" "}
            (
            <a className="link" href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer">
              NLOD 2.0
            </a>
            ) · Adresser: Kartverket · Kart: OpenStreetMap
          </p>
        </div>
        <ul className="flex flex-wrap gap-4 font-semibold sm:flex-col sm:gap-1 sm:text-right">
          <li><Link className="link" href="/">Kart</Link></li>
          <li><Link className="link" href="/analyse">Analyse</Link></li>
          <li><Link className="link" href="/prediksjon">Spåkula</Link></li>
          <li><Link className="link" href="/varsling">Varsling</Link></li>
          <li><Link className="link" href="/om">Om tjenesten</Link></li>
        </ul>
      </div>
    </footer>
  );
}
