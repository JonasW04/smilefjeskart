import Link from "next/link";
import { getPrediksjon, getStedPrediksjon } from "@/lib/server/prediksjon";
import { prosent } from "@/lib/stats";

/** Liten kortboks på stedssiden med spåkulas anslag for stedet. Viser ingenting uten data. */
export default function StedSpaakort({ slug }: { slug: string }) {
  const d = getPrediksjon();
  const p = getStedPrediksjon(slug);
  if (!d || !p) return null;

  const snitt = d.utfall.landSnitt;
  const sammenlignet =
    p.utfall < snitt * 0.75 ? "lavere enn snittet" : p.utfall > snitt * 1.33 ? "høyere enn snittet" : "omtrent som snittet";

  return (
    <section className="card space-y-3 p-5" aria-labelledby="spaa-tittel">
      <h2 id="spaa-tittel" className="font-display text-xl font-extrabold">Spåkula 🔮</h2>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="font-semibold">Ordinært tilsyn de neste {d.horisont} dagene</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span className="block h-2 flex-1 overflow-hidden rounded-full bg-accent-soft" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p.besok * 100)}%` }} />
            </span>
            <span className="w-12 text-right font-extrabold tabular-nums">{prosent(p.besok)}</span>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Strekmunn eller sur munn, hvis det blir ordinært tilsyn</dt>
          <dd className="mt-1">
            <span className="font-extrabold tabular-nums">{prosent(p.utfall)}</span>{" "}
            <span className="text-ink-soft">({sammenlignet}, som er {prosent(snitt)})</span>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-ink-soft">
        Et statistisk anslag ut fra offentlig tilsynshistorikk og hvordan lignende steder har gått før. Det er ikke en vurdering av stedet i dag,
        og også steder med høyt anslag får ofte smil.{" "}
        <Link className="link" href="/prediksjon#metode">Slik regner vi</Link>
      </p>
    </section>
  );
}
