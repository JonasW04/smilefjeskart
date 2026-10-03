import Link from "next/link";
import Smiley from "@/components/Smiley";
import type { SmileyKind } from "@/lib/smiley";

export type StatusInnhold = {
  kind: SmileyKind;
  tittel: string;
  tekst: string;
  bg: string;
  lenke?: { href: string; tekst: string };
};

/** Stor, vennlig statusboks for bekreftelses- og avmeldingssidene. */
export default function StatusKort({ innhold }: { innhold: StatusInnhold }) {
  return (
    <div className="mx-auto max-w-xl py-4 sm:py-10">
      <section className={`card ${innhold.bg} p-6 text-center sm:p-10`} aria-labelledby="status-tittel">
        <div className="pop-in mx-auto mb-4 w-fit -rotate-6">
          <Smiley kind={innhold.kind} size={104} />
        </div>
        <h1 id="status-tittel" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {innhold.tittel}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">{innhold.tekst}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {innhold.lenke && (
            <Link href={innhold.lenke.href} className="btn btn-primary">
              {innhold.lenke.tekst}
            </Link>
          )}
          <Link href="/" className="btn">
            🗺️ Til kartet
          </Link>
        </div>
      </section>
    </div>
  );
}
