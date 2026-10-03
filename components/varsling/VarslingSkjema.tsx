"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Smiley from "@/components/Smiley";
import { SMILE_LABEL, SMILES, type Smile } from "@/lib/smile";
import { asciiFold, foldForSearch } from "@/lib/text";
import type { KommuneValg, PoststedValg } from "@/lib/varsling/omrade";
import { MAKS_KOMMUNER, RADIUSER, type Radius } from "@/lib/varsling/typer";
import { iNorge, validerAbonnement, type Valideringsfeil } from "@/lib/varsling/validering";
import StedSok, { type SokValg } from "./StedSok";

type Props = { kommuner: KommuneValg[]; poststeder: PoststedValg[] };

type Punkt = { lat: number; lng: number; navn: string };
type Estimat = { steder: number; siste12: Record<Smile, number>; dagerMedTreff: number };

const RADIUS_TEKST: Record<Radius, { navn: string; emoji: string }> = {
  2: { navn: "Gåavstand", emoji: "🚶" },
  5: { navn: "Sykkelavstand", emoji: "🚲" },
  10: { navn: "Hele byen", emoji: "🏙️" },
  25: { navn: "Hele regionen", emoji: "🚗" },
};

const FILTER_TEKST: Record<Smile, string> = {
  sur: "Alvorlige brudd. Den du ikke vil gå glipp av.",
  strek: "Brudd som må følges opp.",
  smil: "Alt i orden. Hyggelig, men det blir mye post!",
};

const FLERTALL: Record<Smile, [string, string]> = {
  smil: ["smil", "smil"],
  strek: ["strekmunn", "strekmunner"],
  sur: ["sur munn", "sure munner"],
};

const sokTekst = (s: string) => `${foldForSearch(s)} ${asciiFold(s)}`;

function epostPerMaaned(dager: number): string {
  const perMnd = dager / 12;
  if (dager === 0) return "nesten aldri e-post – men skjer det noe, får du vite det";
  if (perMnd < 0.75) return `rundt ${dager === 1 ? "én e-post" : `${dager} e-poster`} i året`;
  if (perMnd > 20) return "e-post nesten hver dag (vurder et mindre område?)";
  const n = Math.round(perMnd);
  return `rundt ${n === 1 ? "én e-post" : `${n} e-poster`} i måneden`;
}

export default function VarslingSkjema({ kommuner, poststeder }: Props) {
  const [modus, setModus] = useState<"punkt" | "kommuner">("punkt");
  const [punkt, setPunkt] = useState<Punkt | null>(null);
  const [km, setKm] = useState<Radius>(5);
  const [valgte, setValgte] = useState<string[]>([]);
  const [filtre, setFiltre] = useState<Smile[]>(["strek", "sur"]);
  const [epost, setEpost] = useState("");
  const [nettside, setNettside] = useState("");
  const [finner, setFinner] = useState(false);
  const [status, setStatus] = useState<"klar" | "sender" | "ferdig">("klar");
  const [feil, setFeil] = useState<Valideringsfeil>({});
  const [melding, setMelding] = useState<string | null>(null);
  const [estimat, setEstimat] = useState<{ q: string; data: Estimat } | null>(null);
  const ferdigRef = useRef<HTMLHeadingElement>(null);
  const feilRef = useRef<HTMLDivElement>(null);

  const kommuneNavn = useMemo(() => new Map(kommuner.map((k) => [k[0], k[1]])), [kommuner]);

  const punktValg = useMemo<SokValg[]>(
    () => [
      ...kommuner.map((k) => ({ id: `k${k[0]}`, tittel: k[1], under: `Kommune · ${k[2]}`, sok: sokTekst(k[1]) })),
      ...poststeder.map((p, i) => ({ id: `p${i}`, tittel: p[0], under: p[1], sok: sokTekst(p[0]) })),
    ],
    [kommuner, poststeder],
  );
  const kommuneValg = useMemo<SokValg[]>(
    () =>
      kommuner
        .filter((k) => !valgte.includes(k[0]))
        .map((k) => ({ id: k[0], tittel: k[1], under: k[2], sok: sokTekst(k[1]) })),
    [kommuner, valgte],
  );

  const omrade = useMemo(() => {
    if (modus === "punkt") return punkt ? { type: "radius" as const, lat: punkt.lat, lng: punkt.lng, km } : null;
    return valgte.length > 0 ? { type: "kommuner" as const, kommuner: valgte } : null;
  }, [modus, punkt, km, valgte]);

  // Estimat: hvor mye post kan man vente seg?
  const estimatQ = useMemo(() => {
    if (!omrade || filtre.length === 0) return null;
    const p = new URLSearchParams();
    if (omrade.type === "radius") {
      // Grovt (~1 km) – nok til et estimat, og posisjonen havner ikke presist i noen logg.
      p.set("lat", omrade.lat.toFixed(2));
      p.set("lng", omrade.lng.toFixed(2));
      p.set("km", String(omrade.km));
    } else {
      p.set("kommuner", omrade.kommuner.join(","));
    }
    p.set("filtre", filtre.join(","));
    return p.toString();
  }, [omrade, filtre]);

  useEffect(() => {
    if (!estimatQ) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/varsling/estimat?${estimatQ}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: (Estimat & { ok: boolean }) | null) => {
          if (d?.ok) setEstimat({ q: estimatQ, data: d });
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [estimatQ]);

  const visEstimat = estimat && estimat.q === estimatQ ? estimat.data : null;

  function brukPosisjon() {
    setFeil((f) => ({ ...f, omrade: undefined }));
    if (!("geolocation" in navigator)) {
      setFeil((f) => ({ ...f, omrade: "Nettleseren din kan ikke dele posisjon. Søk etter et sted i stedet." }));
      return;
    }
    setFinner(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFinner(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!iNorge(lat, lng)) {
          setFeil((f) => ({ ...f, omrade: "Du ser ut til å være utenfor Norge. Søk etter et sted i stedet." }));
          return;
        }
        setPunkt({ lat, lng, navn: "Der du er nå" });
      },
      () => {
        setFinner(false);
        setFeil((f) => ({ ...f, omrade: "Fikk ikke tak i posisjonen din. Sjekk tillatelsen, eller søk etter et sted." }));
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  function velgPunkt(v: SokValg) {
    setFeil((f) => ({ ...f, omrade: undefined }));
    if (v.id.startsWith("k")) {
      const k = kommuner.find((x) => `k${x[0]}` === v.id);
      if (k) setPunkt({ lat: k[3], lng: k[4], navn: `${k[1]} sentrum` });
    } else {
      const p = poststeder[Number(v.id.slice(1))];
      if (p) setPunkt({ lat: p[2], lng: p[3], navn: p[1] && p[1] !== p[0] ? `${p[0]}, ${p[1]}` : p[0] });
    }
  }

  function leggTilKommune(v: SokValg) {
    setFeil((f) => ({ ...f, omrade: undefined }));
    setValgte((liste) => (liste.includes(v.id) || liste.length >= MAKS_KOMMUNER ? liste : [...liste, v.id]));
  }

  function byttFilter(s: Smile) {
    setFeil((f) => ({ ...f, filtre: undefined }));
    setFiltre((liste) => (liste.includes(s) ? liste.filter((x) => x !== s) : SMILES.filter((x) => x === s || liste.includes(x))));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sender") return;
    setMelding(null);
    const body = { epost, omrade, filtre, nettside };
    const lokal = validerAbonnement(body, () => true);
    if (!lokal.ok) {
      setFeil(lokal.feil);
      requestAnimationFrame(() => feilRef.current?.focus());
      return;
    }
    setFeil({});
    setStatus("sender");
    try {
      const res = await fetch("/api/varsling/abonner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; melding?: string; feil?: Valideringsfeil } | null;
      if (res.ok && data?.ok) {
        setStatus("ferdig");
        requestAnimationFrame(() => ferdigRef.current?.focus());
        return;
      }
      setStatus("klar");
      setFeil(data?.feil ?? {});
      setMelding(data?.melding ?? "Noe gikk galt. Prøv igjen om litt.");
      requestAnimationFrame(() => feilRef.current?.focus());
    } catch {
      setStatus("klar");
      setMelding("Fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen.");
      requestAnimationFrame(() => feilRef.current?.focus());
    }
  }

  if (status === "ferdig") {
    return (
      <div className="card bg-smil-soft p-6 text-center sm:p-8">
        <div className="pop-in mx-auto mb-3 w-fit -rotate-6 text-6xl" aria-hidden>
          📬
        </div>
        <h2 ref={ferdigRef} tabIndex={-1} className="font-display text-3xl font-extrabold">
          Sjekk innboksen!
        </h2>
        <p className="mx-auto mt-2 max-w-md text-ink-soft">
          Vi har sendt en e-post til <strong className="text-ink">{epost.trim()}</strong>. Trykk på lenken i den for å skru på
          varselet. Lenken virker i 48 timer.
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-soft">
          Ingen e-post? Sjekk søppelposten, eller vent noen minutter. Uten bekreftelse skjer ingenting.
        </p>
        <button
          type="button"
          className="btn mt-5"
          onClick={() => {
            setStatus("klar");
            setEpost("");
          }}
        >
          ↩︎ Lag et nytt varsel
        </button>
      </div>
    );
  }

  const feilListe = Object.entries(feil).filter(([, v]) => v) as Array<[keyof Valideringsfeil, string]>;
  const radioKlasse =
    "flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-line/30 bg-card px-3 py-2.5 font-bold transition-colors hover:border-line has-[:checked]:border-line has-[:checked]:bg-accent-soft has-[:checked]:shadow-[3px_3px_0_var(--shadow-ink)] has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent";

  return (
    <form onSubmit={send} noValidate className="card space-y-7 p-5 sm:p-7" aria-labelledby="skjema-tittel">
      <h2 id="skjema-tittel" className="font-display text-2xl font-extrabold">
        Lag ditt varsel
      </h2>

      <div ref={feilRef} tabIndex={-1} role="alert" className="empty:hidden">
        {(melding || feilListe.length > 0) && (
          <div className="rounded-2xl border-2 border-line bg-sur-soft p-4">
            <p className="font-bold">😬 {melding ?? "Noe mangler før vi kan sende:"}</p>
            {feilListe.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {feilListe.map(([k, v]) => (
                  <li key={k}>
                    <a className="link" href={`#felt-${k}`}>
                      {v}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 1. Hvor */}
      <fieldset id="felt-omrade" className="space-y-4" aria-describedby={feil.omrade ? "feil-omrade" : undefined}>
        <legend className="mb-3 font-display text-xl font-extrabold">
          <span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full bg-ink text-base text-paper" aria-hidden>
            1
          </span>
          Hvor vil du følge med?
        </legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type område">
          <label className={radioKlasse}>
            <input type="radio" name="modus" className="sr-only" checked={modus === "punkt"} onChange={() => setModus("punkt")} />
            <span aria-hidden>📍</span> Rundt et punkt
          </label>
          <label className={radioKlasse}>
            <input type="radio" name="modus" className="sr-only" checked={modus === "kommuner"} onChange={() => setModus("kommuner")} />
            <span aria-hidden>🏘️</span> Hele kommuner
          </label>
        </div>

        {modus === "punkt" ? (
          <div className="space-y-4">
            {punkt ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-line/40 bg-paper p-3">
                <span className="text-2xl" aria-hidden>
                  📍
                </span>
                <p className="min-w-0 flex-1">
                  <span className="block text-sm text-ink-soft">Valgt punkt</span>
                  <strong>{punkt.navn}</strong>
                </p>
                <button type="button" className="btn text-sm" onClick={() => setPunkt(null)}>
                  Endre
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button type="button" className="btn btn-primary w-full justify-center sm:w-auto" onClick={brukPosisjon} disabled={finner}>
                  <span aria-hidden>🛰️</span> {finner ? "Leter etter deg …" : "Bruk posisjonen min"}
                </button>
                <p className="text-sm font-semibold text-ink-soft">…eller</p>
                <StedSok
                  label="Søk etter sted eller kommune"
                  placeholder="F.eks. Grünerløkka, Tromsø, Voss"
                  valg={punktValg}
                  onVelg={velgPunkt}
                  feilId="feil-omrade"
                  ugyldig={!!feil.omrade}
                />
              </div>
            )}

            <div>
              <p id="radius-tittel" className="mb-2 font-bold">
                Hvor langt unna?
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="radius-tittel">
                {RADIUSER.map((r) => (
                  <label key={r} className={`${radioKlasse} flex-col items-start gap-0`}>
                    <input type="radio" name="km" value={r} className="sr-only" checked={km === r} onChange={() => setKm(r)} />
                    <span className="text-lg">
                      {r} km <span aria-hidden>{RADIUS_TEKST[r].emoji}</span>
                    </span>
                    <span className="text-xs font-semibold text-ink-soft">{RADIUS_TEKST[r].navn}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <StedSok
              label="Legg til kommuner"
              hjelp={`Velg opptil ${MAKS_KOMMUNER}.`}
              placeholder="F.eks. Bergen"
              valg={valgte.length >= MAKS_KOMMUNER ? [] : kommuneValg}
              onVelg={leggTilKommune}
              feilId="feil-omrade"
              ugyldig={!!feil.omrade}
            />
            {valgte.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Valgte kommuner">
                {valgte.map((nr) => (
                  <li key={nr}>
                    <button
                      type="button"
                      className="chip gap-1.5 py-1 hover:bg-sur-soft"
                      onClick={() => setValgte((l) => l.filter((x) => x !== nr))}
                      aria-label={`Fjern ${kommuneNavn.get(nr) ?? nr}`}
                    >
                      {kommuneNavn.get(nr) ?? nr} <span aria-hidden>✕</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {feil.omrade && (
          <p id="feil-omrade" className="rounded-lg bg-sur-soft px-2 py-1 text-sm font-bold">
            <span aria-hidden>⚠️ </span>
            {feil.omrade}
          </p>
        )}
      </fieldset>

      {/* 2. Hva */}
      <fieldset id="felt-filtre" aria-describedby={feil.filtre ? "feil-filtre" : undefined}>
        <legend className="mb-3 font-display text-xl font-extrabold">
          <span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full bg-ink text-base text-paper" aria-hidden>
            2
          </span>
          Hvilke smilefjes vil du høre om?
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["sur", "strek", "smil"] as const).map((s) => (
            <label key={s} className={`${radioKlasse} items-start font-normal`}>
              <input type="checkbox" className="sr-only" checked={filtre.includes(s)} onChange={() => byttFilter(s)} />
              <Smiley kind={s} size={36} className="shrink-0" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-bold">
                  {SMILE_LABEL[s]}
                  <span
                    className="inline-grid h-5 w-5 place-items-center rounded-md border-2 border-line text-xs"
                    aria-hidden
                  >
                    {filtre.includes(s) ? "✓" : ""}
                  </span>
                </span>
                <span className="block text-xs text-ink-soft">{FILTER_TEKST[s]}</span>
              </span>
            </label>
          ))}
        </div>
        {feil.filtre && (
          <p id="feil-filtre" className="mt-2 rounded-lg bg-sur-soft px-2 py-1 text-sm font-bold">
            <span aria-hidden>⚠️ </span>
            {feil.filtre}
          </p>
        )}
      </fieldset>

      {/* Estimat */}
      <div aria-live="polite" className="empty:hidden">
        {visEstimat && omrade && (
          <div className="rounded-2xl bg-paper-2 p-4 text-sm">
            <p>
              <span aria-hidden>🔮 </span>
              {omrade.type === "radius" ? "Innenfor området" : omrade.kommuner.length === 1 ? "I kommunen" : "I kommunene"} er det{" "}
              <strong>{visEstimat.steder.toLocaleString("nb-NO")} serveringssteder</strong>. Det siste året endte tilsynene der med{" "}
              {(["smil", "strek", "sur"] as const)
                .map((s) => `${visEstimat.siste12[s].toLocaleString("nb-NO")} ${FLERTALL[s][visEstimat.siste12[s] === 1 ? 0 : 1]}`)
                .join(", ")
                .replace(/, ([^,]*)$/, " og $1")}
              .
            </p>
            <p className="mt-1 font-bold">Med valgene dine blir det {epostPerMaaned(visEstimat.dagerMedTreff)}.</p>
          </div>
        )}
      </div>

      {/* 3. Hvem */}
      <fieldset>
        <legend className="mb-3 font-display text-xl font-extrabold">
          <span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full bg-ink text-base text-paper" aria-hidden>
            3
          </span>
          Hvor skal vi sende det?
        </legend>
        <label htmlFor="felt-epost" className="mb-1 block font-bold">
          E-postadresse
        </label>
        <input
          id="felt-epost"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={254}
          value={epost}
          onChange={(e) => {
            setEpost(e.target.value);
            if (feil.epost) setFeil((f) => ({ ...f, epost: undefined }));
          }}
          aria-invalid={!!feil.epost || undefined}
          aria-describedby={`epost-hjelp${feil.epost ? " feil-epost" : ""}`}
          placeholder="navn@eksempel.no"
          className="w-full rounded-2xl border-2 border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-soft/70"
        />
        <p id="epost-hjelp" className="mt-1 text-sm text-ink-soft">
          Vi sender først en e-post du må bekrefte. Maks én e-post om dagen etter det.
        </p>
        {feil.epost && (
          <p id="feil-epost" className="mt-1 rounded-lg bg-sur-soft px-2 py-1 text-sm font-bold">
            <span aria-hidden>⚠️ </span>
            {feil.epost}
          </p>
        )}

        {/* Honningkrukke for roboter – skjult for mennesker og skjermlesere. */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label>
            Nettside (ikke fyll ut)
            <input type="text" name="nettside" tabIndex={-1} autoComplete="off" value={nettside} onChange={(e) => setNettside(e.target.value)} />
          </label>
        </div>
      </fieldset>

      <div className="space-y-3 border-t-2 border-dashed border-line/30 pt-5">
        <button type="submit" className="btn btn-primary w-full justify-center py-3 text-lg sm:w-auto" disabled={status === "sender"} aria-disabled={status === "sender"}>
          {status === "sender" ? "Sender …" : "📬 Send meg varsler"}
        </button>
        <p className="text-xs text-ink-soft">
          Vi lagrer bare e-postadressen og området du har valgt, og sletter alt når du melder deg av.{" "}
          <a className="link" href="#personvern">
            Les mer om personvern
          </a>
          .
        </p>
      </div>
    </form>
  );
}
