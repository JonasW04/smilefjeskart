"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StedApi } from "@/app/api/sted/[slug]/route";
import FordelingBar from "@/components/FordelingBar";
import Smiley from "@/components/Smiley";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, formatDato, prosent, tidSiden } from "@/lib/stats";

type Props = { slug: string; onLukk: () => void };

type Tilstand = { slug: string; data: StedApi | null; feil: boolean };

export default function StedPanel({ slug, onLukk }: Props) {
  const [tilstand, setTilstand] = useState<Tilstand>({ slug, data: null, feil: false });
  const [kopiert, setKopiert] = useState(false);
  const lukkRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/sted/${encodeURIComponent(slug)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: StedApi) => setTilstand({ slug, data, feil: false }))
      .catch((e) => {
        if (e.name !== "AbortError") setTilstand({ slug, data: null, feil: true });
      });
    return () => ctrl.abort();
  }, [slug]);

  useEffect(() => {
    lukkRef.current?.focus({ preventScroll: true });
  }, [slug]);

  const gjeldende = tilstand.slug === slug ? tilstand : { slug, data: null, feil: false };
  const d = gjeldende.data;

  const del = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1800);
    } catch {
      /* utklippstavle ikke tilgjengelig */
    }
  };

  return (
    <aside
      aria-label={d ? `Om ${d.navn}` : "Stedsinformasjon"}
      className="card absolute inset-x-2 bottom-2 z-20 max-h-[62%] overflow-y-auto p-4 sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-[380px] sm:p-5"
    >
      <button
        ref={lukkRef}
        type="button"
        onClick={onLukk}
        aria-label="Lukk"
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border-2 border-line bg-card text-lg font-bold hover:bg-accent-soft"
      >
        ✕
      </button>

      {gjeldende.feil && <p className="pr-10 font-semibold">Oi, klarte ikke å hente stedet. Prøv igjen litt senere.</p>}

      {!d && !gjeldende.feil && (
        <div className="animate-pulse space-y-3 pr-10" aria-busy="true" aria-label="Laster">
          <div className="h-16 w-16 rounded-full bg-paper-2" />
          <div className="h-6 w-3/4 rounded bg-paper-2" />
          <div className="h-4 w-1/2 rounded bg-paper-2" />
          <div className="h-20 rounded-xl bg-paper-2" />
        </div>
      )}

      {d && <Innhold d={d} del={del} kopiert={kopiert} />}
    </aside>
  );
}

function Innhold({ d, del, kopiert }: { d: StedApi; del: () => void; kopiert: boolean }) {
  const siste = d.tilsyn[d.tilsyn.length - 1];
  const sisteSmil = smileFromKarakter(siste.karakter);
  const visHistorikk = d.tilsyn.slice(-16);
  const egenAndel = andel(d.ordinaer, "smil");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 pr-10">
        <span className="pop-in shrink-0" key={d.slug}>
          <Smiley kind={kindFromKarakter(siste.karakter)} size={64} label={sisteSmil ? SMILE_LABEL[sisteSmil] : "Ukjent"} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold leading-tight">{d.navn}</h2>
          <p className="text-sm text-ink-soft">{d.adresse}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="chip">{d.kategori}</span>
        {d.kjede && <span className="chip">🔗 {d.kjede}</span>}
      </div>

      <p className="text-sm">
        <strong>{sisteSmil ? SMILE_LABEL[sisteSmil] : "Ukjent"}</strong> ved siste tilsyn {formatDato(siste.dato)}{" "}
        <span className="text-ink-soft">({tidSiden(siste.dato)})</span>
        {siste.oppfolging && <span className="text-ink-soft">, et oppfølgingstilsyn</span>}.
      </p>

      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
          {d.tilsyn.length > visHistorikk.length ? `Siste ${visHistorikk.length} av ${d.tilsyn.length} tilsyn` : `Alle ${d.tilsyn.length} tilsyn`}
        </p>
        <ol className="flex flex-wrap gap-1" aria-label="Tilsynshistorikk, eldste først">
          {visHistorikk.map((t, i) => {
            const sm = smileFromKarakter(t.karakter);
            const tekst = `${formatDato(t.dato)}: ${sm ? SMILE_LABEL[sm] : "ukjent"}${t.oppfolging ? " (oppfølging)" : ""}`;
            return (
              <li key={i} title={tekst} className={t.oppfolging ? "opacity-60" : ""}>
                <Smiley kind={kindFromKarakter(t.karakter)} size={22} label={tekst} />
              </li>
            );
          })}
        </ol>
      </div>

      {d.ordinaer.total > 0 && (
        <div className="space-y-2 rounded-2xl bg-paper p-3">
          <FordelingBar fordeling={d.ordinaer} label="Ordinære tilsyn her" />
          <p className="text-xs text-ink-soft">
            {egenAndel < d.landAndelSmil - 0.15
              ? `Under snittet: ${prosent(egenAndel)} smil mot ${prosent(d.landAndelSmil)} i hele Norge.`
              : egenAndel >= d.landAndelSmil
                ? `Like bra som eller bedre enn snittet i Norge (${prosent(d.landAndelSmil)}).`
                : `Litt under snittet i Norge (${prosent(d.landAndelSmil)}).`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/sted/${d.slug}`} className="btn btn-primary">
          Se hele historikken →
        </Link>
        <button type="button" onClick={del} className="btn" aria-live="polite">
          {kopiert ? "✅ Kopiert!" : "🔗 Del"}
        </button>
      </div>
    </div>
  );
}
