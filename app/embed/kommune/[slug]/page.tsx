import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Smiley from "@/components/Smiley";
import { endringPp } from "@/lib/analyse";
import { tall } from "@/lib/chart";
import { forrigeMaaned, grupperPeriode } from "@/lib/rapport";
import { landFordeling } from "@/lib/server/data";
import { getOmrade, kommuner, sluttDato } from "@/lib/server/omrader";
import { landPeriode } from "@/lib/server/rapport";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, formatDato, prosent, sisteTilsyn } from "@/lib/stats";

/*
 * Widget for innbygging på andres nettsider (iframe). Ligger utenfor (site), så den får verken
 * toppmeny eller bunntekst. next.config.ts tillater innramming bare for /embed/*.
 * Alle lenker åpner i ny fane: resten av nettstedet kan ikke vises i en iframe.
 */

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return kommuner().map((k) => ({ slug: k.slug }));
}
export const dynamicParams = false;

/** Under så mange ordinære tilsyn siste 12 måneder vises ikke 12-månederstallet. */
const MIN_12MND = 10;
const SITE = "https://smilefjeskartet.no";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const o = getOmrade("kommune", slug);
  return {
    title: o ? `Smilefjes i ${o.visningsnavn} | Smilefjeskartet` : "Smilefjeskartet",
    // Kommunesiden er originalen; widgeten skal ikke konkurrere med den i søk.
    robots: { index: false, follow: true },
  };
}

/** «2,1 prosentpoeng over landssnittet» / «Omtrent som landssnittet». */
function motLandet(diffPp: number): string {
  if (Math.abs(diffPp) < 0.5) return "Omtrent som";
  const v = Math.abs(diffPp).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v} prosentpoeng ${diffPp > 0 ? "over" : "under"}`;
}

export default async function KommuneWidget({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const o = getOmrade("kommune", slug);
  if (!o) notFound();

  const smil = andel(o.ordinaer, "smil");
  const landSmil = andel(landFordeling(), "smil");
  const diff = endringPp(landSmil, smil);

  const til = sluttDato().slice(0, 7);
  const fra = forrigeMaaned(til, 11);
  const k12 = grupperPeriode(o.steder, fra, til, () => "k").get("k")?.ordinaer;
  const l12 = landPeriode(fra, til);

  const nylig = [...o.steder].sort((a, b) => sisteTilsyn(b).dato.localeCompare(sisteTilsyn(a).dato)).slice(0, 5);
  const side = `${SITE}/kommune/${o.slug}`;

  return (
    <div className="flex min-h-dvh flex-col bg-paper p-3 text-ink">
      <div className="card flex flex-1 flex-col gap-3 p-4">
        <header className="flex items-center gap-3">
          <Smiley kind={smil >= landSmil - 0.02 ? "smil" : "strek"} size={48} className="shrink-0 -rotate-6" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Smilefjes i</p>
            <h1 className="truncate font-display text-2xl font-extrabold leading-tight">{o.visningsnavn}</h1>
          </div>
        </header>

        <div className="rounded-2xl bg-accent-soft p-3">
          <p className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-extrabold leading-none tabular-nums">{prosent(smil)}</span>
            <span className="text-sm font-semibold">av {tall(o.ordinaer.total)} ordinære tilsyn endte med smil</span>
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">
            {o.ordinaer.total > 0 ? (
              <>
                {motLandet(diff)} landssnittet på {prosent(landSmil)} (siden 2016).
              </>
            ) : (
              "Ingen ordinære tilsyn ennå."
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {k12 && k12.total >= MIN_12MND ? (
              <>
                Siste 12 mnd: <strong className="text-ink">{prosent(andel(k12, "smil"))}</strong> smil (Norge {prosent(andel(l12, "smil"))}).
              </>
            ) : (
              `For få tilsyn siste 12 mnd til et eget tall.`
            )}
          </p>
        </div>

        <section aria-labelledby="nylig" className="min-h-0 flex-1">
          <h2 id="nylig" className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-soft">
            Sist inspisert
          </h2>
          <ul className="divide-y divide-line/10">
            {nylig.map((s) => {
              const t = sisteTilsyn(s);
              const k = smileFromKarakter(t.karakter);
              return (
                <li key={s.id}>
                  <a
                    href={`${SITE}/sted/${s.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent-soft"
                  >
                    <Smiley kind={kindFromKarakter(t.karakter)} size={22} label={k ? SMILE_LABEL[k] : "Ukjent"} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.navn}</span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft">{formatDato(t.dato)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-line/10 pt-2 text-xs">
          <a href={side} target="_blank" rel="noopener" className="link font-bold">
            Data fra Smilefjeskartet.no
          </a>
          <span className="text-ink-soft">Kilde: Mattilsynet</span>
        </footer>
      </div>
    </div>
  );
}
