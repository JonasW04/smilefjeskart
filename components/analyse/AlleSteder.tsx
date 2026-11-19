"use client";

import { useId, useRef, useState } from "react";
import { filtrerSteder, FLERE_RADER, stedRad, type StedTuppel } from "@/lib/stedliste";
import StedRader from "./StedRader";

type Props = {
  /** De første radene, server-rendret (lenkene er synlige for søkemotorer uten JavaScript). */
  forste: StedTuppel[];
  totalt: number;
  /** JSON med alle stedene (StedTuppel[]), hentes første gang noen søker eller vil se flere. */
  kilde: string;
};

const tall = (n: number) => n.toLocaleString("nb-NO");

/**
 * «Alle steder» for store kommuner og kjeder: viser de første radene med en gang, og henter resten
 * først når noen søker eller trykker «Vis flere». Holder HTML-en og RSC-payloaden liten.
 */
export default function AlleSteder({ forste, totalt, kilde }: Props) {
  const [alle, setAlle] = useState<StedTuppel[] | null>(null);
  const [status, setStatus] = useState<"hviler" | "laster" | "feil">("hviler");
  const [sok, setSok] = useState("");
  const [antall, setAntall] = useState(forste.length);
  const henting = useRef<Promise<StedTuppel[] | null> | null>(null);
  const sokId = useId();

  function hent(): Promise<StedTuppel[] | null> {
    if (alle) return Promise.resolve(alle);
    if (!henting.current) {
      setStatus("laster");
      henting.current = fetch(kilde)
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<StedTuppel[]>;
        })
        .then((data) => {
          setAlle(data);
          setStatus("hviler");
          return data;
        })
        .catch(() => {
          henting.current = null;
          setStatus("feil");
          return null;
        });
    }
    return henting.current;
  }

  const kilderader = alle ?? forste;
  const soker = sok.trim() !== "";
  const liste = soker && alle ? filtrerSteder(alle, sok) : kilderader;
  const vist = soker && !alle ? [] : liste.slice(0, antall);
  const igjen = (soker ? liste.length : totalt) - vist.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={sokId} className="sr-only">
          Søk blant {tall(totalt)} steder
        </label>
        <input
          id={sokId}
          type="search"
          value={sok}
          onFocus={() => void hent()}
          onChange={(e) => {
            setSok(e.target.value);
            void hent();
          }}
          placeholder={`🔎 Søk blant ${tall(totalt)} steder`}
          autoComplete="off"
          className="w-full max-w-sm rounded-full border-2 border-line bg-card px-4 py-2 text-sm font-semibold text-ink placeholder:text-ink-soft"
        />
        <p className="text-xs font-semibold text-ink-soft" aria-live="polite">
          {status === "laster" && soker
            ? "Henter steder …"
            : status === "feil"
              ? "Klarte ikke å hente stedene. Prøv igjen."
              : soker
                ? `${tall(liste.length)} treff`
                : `Viser ${tall(vist.length)} av ${tall(totalt)}`}
        </p>
      </div>

      {vist.length > 0 ? (
        <StedRader kolonner={3} rader={vist.map(stedRad)} />
      ) : (
        soker && alle && <p className="text-sm">Ingen steder her matcher «{sok.trim()}».</p>
      )}

      {igjen > 0 && !(soker && !alle) && (
        <button
          type="button"
          className="btn text-sm"
          disabled={status === "laster"}
          onClick={async () => {
            if (await hent()) setAntall((n) => n + FLERE_RADER);
          }}
        >
          {status === "laster" ? "⏳ Henter …" : `Vis flere (${tall(igjen)} igjen)`}
        </button>
      )}
    </div>
  );
}
