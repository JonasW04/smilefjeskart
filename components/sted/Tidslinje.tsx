import Smiley from "@/components/Smiley";
import { kindFromKarakter } from "@/lib/smiley";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { formatDato } from "@/lib/stats";
import type { Tilsyn } from "@/lib/types";

/** Alle tilsyn som smilefjes langs en tidsakse. Tette tilsyn stables i høyden. */
export default function Tidslinje({ tilsyn, iDag }: { tilsyn: Tilsyn[]; iDag: string }) {
  const startAar = Number(tilsyn[0].dato.slice(0, 4));
  const sluttAar = Number(iDag.slice(0, 4));
  const start = Date.parse(`${startAar}-01-01`);
  const slutt = Date.parse(`${sluttAar + 1}-01-01`);
  const pos = (iso: string) => ((Date.parse(iso) - start) / (slutt - start)) * 100;

  const plassert: Array<{ t: Tilsyn; x: number; rad: number }> = [];
  for (const t of tilsyn) {
    const x = pos(t.dato);
    let rad = 0;
    while (plassert.some((p) => p.rad === rad && Math.abs(p.x - x) < 4.5)) rad++;
    plassert.push({ t, x, rad: Math.min(rad, 3) });
  }
  const rader = Math.max(...plassert.map((p) => p.rad)) + 1;
  const aar = Array.from({ length: sluttAar - startAar + 1 }, (_, i) => startAar + i);

  return (
    <figure>
      <div className="relative mx-3" style={{ height: 30 + rader * 30 }}>
        {plassert.map(({ t, x, rad }, i) => {
          const smil = smileFromKarakter(t.karakter);
          return (
            <div
              key={i}
              className="pop-in absolute -translate-x-1/2"
              style={{ left: `${x}%`, bottom: 4 + rad * 30, animationDelay: `${i * 40}ms` }}
              title={`${formatDato(t.dato)}: ${smil ? SMILE_LABEL[smil] : "ukjent"}${t.oppfolging ? " (oppfølging)" : ""}`}
            >
              <Smiley kind={kindFromKarakter(t.karakter)} size={26} />
            </div>
          );
        })}
      </div>
      <div className="relative mx-3 h-6 border-t-2 border-line" aria-hidden>
        {aar.map((a) => (
          <span
            key={a}
            className="absolute top-1 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-ink-soft"
            style={{ left: `${pos(`${a}-07-01`)}%` }}
          >
            {aar.length > 8 ? `’${String(a).slice(2)}` : a}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        Tidslinje med {tilsyn.length} tilsyn fra {startAar} til {sluttAar}.
      </figcaption>
    </figure>
  );
}
