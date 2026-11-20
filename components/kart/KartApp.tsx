"use client";

import * as maplibregl from "maplibre-gl";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

if (typeof window !== "undefined") {
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}
import Smiley from "@/components/Smiley";
import { KATEGORI_EMOJI, KATEGORI_NAVN, KJOKKEN_KATEGORIER, STEDTYPE_KATEGORIER, type Kategori } from "@/lib/classify";
import {
  byggSokIndeks,
  harAktivtFilter,
  kommuneBbox,
  lesUrl,
  lesUtsnitt,
  passerFilter,
  radGruppe,
  skrivUrl,
  spredKoordinater,
  tilGeoJson,
  vekslSmil,
  type Modus,
  type SokTreff,
  type StedProps,
} from "@/lib/kart";
import { boksRundt, naerhetsDom, stederInnen, velgRadius, type NaerRadius, type Punkt } from "@/lib/naerhet";
import { SMILES, SMILE_LABEL, type Smile } from "@/lib/smile";
import { KART, type KartData, type KartRad } from "@/lib/types";
import { klyngeElement, leggTilLag, leggTilManglendeIkon, leggTilSmilefjes, settModus, STIL_URL, tilpassGrunnkart } from "./kartStil";
import KartVenter from "./KartVenter";
import NaerMegKort from "./NaerMegKort";
import Sok from "./Sok";
import StedPanel from "./StedPanel";

const KATEGORIER = Object.keys(KATEGORI_NAVN) as Kategori[];
/** I filteret er «Restaurant» restauranter der ingen kilde oppgir kjøkken, og det må navnet si. */
const FILTER_NAVN: Partial<Record<Kategori, string>> = { restaurant: "Andre restauranter" };
const filterNavn = (k: Kategori) => FILTER_NAVN[k] ?? KATEGORI_NAVN[k];

function settValgtFilter(map: maplibregl.Map, slug: string | null) {
  if (map.getLayer("valgt-ring")) {
    map.setFilter("valgt-ring", ["all", ["!", ["has", "point_count"]], ["==", ["get", "s"], slug ?? ""]]);
  }
}
const MORK_QUERY = "(prefers-color-scheme: dark)";
const NORGE: [number, number, number, number] = [4.5, 57.9, 31.2, 71.2];

function useMorkModus(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MORK_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(MORK_QUERY).matches,
    () => false,
  );
}

const MODUS_TEKST: Record<Modus, { navn: string; hjelp: string }> = {
  "tre-aar": {
    navn: "Siste 3 år",
    hjelp: "Dårligste resultat de siste tre årene. Avslører steder som har slitt, selv om de har smil på døra nå.",
  },
  siste: {
    navn: "Siste tilsyn",
    hjelp: "Smilefjeset som henger på døra nå. Nesten alle har smil, fordi Mattilsynet kommer tilbake raskt etter et dårlig resultat.",
  },
};

export default function KartApp() {
  // Komponenten lastes kun i nettleseren (ssr: false), så vi kan lese URL-en direkte.
  const [start] = useState(() => lesUrl(window.location.search, KATEGORIER));
  const [startUtsnitt] = useState(() => lesUtsnitt(window.location.search));
  const [data, setData] = useState<KartData | null>(null);
  const [lastefeil, setLastefeil] = useState(false);
  const [modus, setModus] = useState<Modus>(start.modus);
  const [smil, setSmil] = useState<Set<Smile>>(start.smil);
  const [kategori, setKategori] = useState<Kategori | "alle">(start.kategori);
  const [valgt, setValgt] = useState<string | null>(start.sted);
  const [kartKlart, setKartKlart] = useState(false);
  const [kartfeil, setKartfeil] = useState(false);
  const [kartForsok, setKartForsok] = useState(0);
  // Åpent som standard på brede skjermer, lukket på mobil der kortet dekker kartet.
  const [visFilter, setVisFilter] = useState(() => window.matchMedia("(min-width: 640px)").matches);
  const [finnerMeg, setFinnerMeg] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  /** Posisjonen fra «Nær meg». Nabolagskortet vises så lenge den er satt. */
  const [meg, setMeg] = useState<Punkt | null>(null);
  /** Radius valgt av brukeren; null betyr automatisk. */
  const [naerRadius, setNaerRadius] = useState<NaerRadius | null>(null);
  const mork = useMorkModus();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const modusRef = useRef(modus);
  const morkRef = useRef(mork);
  const geojsonRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Point, StedProps> | null>(null);
  const markerCache = useRef(new Map<string, maplibregl.Marker>());
  const paSkjerm = useRef(new Map<string, maplibregl.Marker>());
  const dataVersjon = useRef(0);
  const megMarker = useRef<maplibregl.Marker | null>(null);
  const harFloyddStart = useRef(false);
  const aktivStil = useRef<boolean | null>(null);
  const valgtRef = useRef(valgt);
  const filterKnappRef = useRef<HTMLButtonElement>(null);

  // ---- Data ----
  useEffect(() => {
    fetch("/data/kart.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: KartData) => setData(d))
      .catch(() => setLastefeil(true));
  }, []);

  const filter = useMemo(() => ({ smil, kategori }), [smil, kategori]);
  const koordinater = useMemo(() => (data ? spredKoordinater(data) : undefined), [data]);
  const geojson = useMemo(() => (data ? tilGeoJson(data, modus, filter, koordinater) : null), [data, modus, filter, koordinater]);
  const indeks = useMemo(() => (data ? byggSokIndeks(data) : null), [data]);
  const telling = useMemo(() => {
    const t = { smil: 0, strek: 0, sur: 0 };
    if (!data) return t;
    for (const r of data.steder) {
      if (kategori !== "alle" && data.kategorier[r[KART.KATEGORI]] !== kategori) continue;
      const g = radGruppe(r, modus);
      if (g < 3) t[SMILES[g]]++;
    }
    return t;
  }, [data, modus, kategori]);

  // Steder rundt brukeren, nærmeste først. Radius og modus filtrerer videre uten nytt søk.
  const naerSteder = useMemo(() => (data && meg ? stederInnen(data, meg, undefined, kategori) : null), [data, meg, kategori]);
  const naerDom = useMemo(
    () => (naerSteder ? naerhetsDom(naerSteder, naerRadius ?? velgRadius(naerSteder), modus) : null),
    [naerSteder, naerRadius, modus],
  );
  const aktivRadius = naerDom?.radius ?? null;

  useEffect(() => {
    modusRef.current = modus;
    morkRef.current = mork;
    geojsonRef.current = geojson;
    valgtRef.current = valgt;
  });

  // ---- Klyngemarkører ----
  const nullstillKlynger = useCallback(() => {
    for (const m of paSkjerm.current.values()) m.remove();
    paSkjerm.current = new Map();
    markerCache.current.clear();
    dataVersjon.current++;
  }, []);

  const oppdaterKlynger = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getSource("steder") || !map.isSourceLoaded("steder")) return;
    const nye = new Map<string, maplibregl.Marker>();
    for (const f of map.querySourceFeatures("steder")) {
      const p = f.properties as Record<string, number> | null;
      if (!p?.cluster) continue;
      const id = `${dataVersjon.current}-${modusRef.current}-${p.cluster_id}`;
      if (nye.has(id)) continue;
      let m = markerCache.current.get(id);
      if (!m) {
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const el = klyngeElement(p, modusRef.current);
        const clusterId = p.cluster_id;
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          const src = map.getSource("steder") as GeoJSONSource;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map.easeTo({ center: coords, zoom: zoom + 0.3 });
        });
        m = new maplibregl.Marker({ element: el }).setLngLat(coords);
        markerCache.current.set(id, m);
      }
      nye.set(id, m);
      if (!paSkjerm.current.has(id)) m.addTo(map);
    }
    for (const [id, m] of paSkjerm.current) if (!nye.has(id)) m.remove();
    paSkjerm.current = nye;
  }, []);

  // ---- Kart ----
  useEffect(() => {
    if (!data || !containerRef.current || mapRef.current) return;
    let avsluttet = false;
    let map: maplibregl.Map;
    try {
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new maplibregl.Map({
        container: containerRef.current,
        style: morkRef.current ? STIL_URL.mork : STIL_URL.lys,
        bounds: startUtsnitt ?? NORGE,
        fitBoundsOptions: {
          padding: window.innerWidth >= 640 ? { top: 30, bottom: 30, left: 400, right: 30 } : { top: 120, bottom: 60, left: 10, right: 10 },
        },
        attributionControl: { compact: true },
        maxZoom: 18.5,
      });
    } catch {
      // WebGL kan være utilgjengelig selv om data og søk fungerer.
      queueMicrotask(() => { if (!avsluttet) setKartfeil(true); });
      return () => { avsluttet = true; };
    }
    mapRef.current = map;
    aktivStil.current = morkRef.current;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // En blokkert eller hengende karttjeneste skal ikke skjule søk og stedspanelet.
    const tidsfrist = setTimeout(() => {
      if (!avsluttet && !map.getLayer("steder-ikon")) setKartfeil(true);
    }, 15_000);
    map.on("error", () => {
      if (!avsluttet && !map.getLayer("steder-ikon")) setKartfeil(true);
    });
    // MapLibre 6: en «styleimagemissing»-lytter kan ikke lenger levere bildet; det må gå via resolveren.
    map.setMissingStyleImageResolver((id) => leggTilManglendeIkon(map, id));
    map.on("style.load", async () => {
      try {
        tilpassGrunnkart(map, morkRef.current);
        await leggTilSmilefjes(map);
        if (avsluttet) return;
        if (!map.getSource("steder") && geojsonRef.current) {
          leggTilLag(map, geojsonRef.current, modusRef.current, morkRef.current);
          settValgtFilter(map, valgtRef.current);
        }
        clearTimeout(tidsfrist);
        nullstillKlynger();
        setKartfeil(false);
        setKartKlart(true);
      } catch {
        if (!avsluttet) setKartfeil(true);
      }
    });

    map.on("click", "steder-ikon", (e) => {
      const slug = (e.features?.[0]?.properties as StedProps | undefined)?.s;
      if (slug) setValgt(slug);
    });

    const kanHovre = window.matchMedia("(hover: hover)").matches;
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, className: "kart-hover" });
    map.on("mouseenter", "steder-ikon", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mousemove", "steder-ikon", (e) => {
      const f = e.features?.[0];
      if (!kanHovre || !f) return;
      hover
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setText((f.properties as StedProps).n)
        .addTo(map);
    });
    map.on("mouseleave", "steder-ikon", () => {
      map.getCanvas().style.cursor = "";
      hover.remove();
    });
    map.on("render", oppdaterKlynger);

    return () => {
      avsluttet = true;
      clearTimeout(tidsfrist);
      nullstillKlynger();
      megMarker.current = null;
      harFloyddStart.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [data, kartForsok, nullstillKlynger, oppdaterKlynger, startUtsnitt]);

  // Bytt grunnkart når lys/mørk modus endres.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !kartKlart || aktivStil.current === mork) return;
    aktivStil.current = mork;
    map.setStyle(mork ? STIL_URL.mork : STIL_URL.lys, { diff: false });
  }, [mork, kartKlart]);

  // Nye data/filter.
  useEffect(() => {
    const src = mapRef.current?.getSource("steder") as GeoJSONSource | undefined;
    if (!kartKlart || !src || !geojson) return;
    nullstillKlynger();
    src.setData(geojson);
  }, [geojson, kartKlart, nullstillKlynger]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !kartKlart) return;
    settModus(map, modus);
    nullstillKlynger();
    map.triggerRepaint();
  }, [modus, kartKlart, nullstillKlynger]);

  // Valgt sted: markering + URL.
  useEffect(() => {
    const map = mapRef.current;
    if (map && kartKlart) settValgtFilter(map, valgt);
  }, [valgt, kartKlart]);

  useEffect(() => {
    const url = `${window.location.pathname}${skrivUrl({ sted: valgt, modus, kategori, smil })}`;
    window.history.replaceState(window.history.state, "", url);
  }, [valgt, modus, kategori, smil]);

  const flyTil = useCallback(
    (slug: string) => {
      const map = mapRef.current;
      const punkt = koordinater?.get(slug);
      if (!map || !punkt) return;
      const bred = window.innerWidth >= 640;
      map.easeTo({
        center: punkt,
        zoom: Math.max(map.getZoom(), 17),
        padding: bred ? { right: 400, left: 0, top: 0, bottom: 0 } : { bottom: window.innerHeight * 0.45, top: 0, left: 0, right: 0 },
        duration: 900,
      });
    },
    [koordinater],
  );

  // Vis hele radiusen rundt brukeren, med plass til nabolagskortet.
  useEffect(() => {
    const map = mapRef.current;
    // Et åpent stedspanel har kartet; flytt det ikke bort fra stedet.
    if (!map || !kartKlart || !meg || aktivRadius === null || valgtRef.current) return;
    const kart = map.getContainer().getBoundingClientRect();
    let padding: maplibregl.PaddingOptions;
    if (kart.width < 640) {
      // Kortet dekker opptil 58 % av kartet nedenfra (max-h i NaerMegKort).
      padding = { top: 100, bottom: kart.height * 0.58 + 10, left: 20, right: 20 };
    } else if (kart.width - 810 >= 250) {
      // Filterkolonnen til venstre, kortet til høyre.
      padding = { top: 40, bottom: 40, left: 400, right: 410 };
    } else {
      // Smalt (nettbrett): bruk plassen under filterkolonnen.
      const filter = document.getElementById("kart-filter")?.getBoundingClientRect();
      const top = filter ? filter.bottom - kart.top + 20 : 40;
      padding = { top: Math.min(top, kart.height - 200), bottom: 40, left: 20, right: 410 };
    }
    map.fitBounds(boksRundt(meg, aktivRadius), {
      padding,
      maxZoom: 16.5,
      duration: 900,
    });
  }, [meg, aktivRadius, kartKlart]);

  // Fly til sted fra URL når kartet er klart.
  useEffect(() => {
    if (!kartKlart || harFloyddStart.current) return;
    harFloyddStart.current = true;
    if (start.sted) flyTil(start.sted);
  }, [kartKlart, start.sted, flyTil]);

  // Escape lukker stedspanelet, og deretter nabolagskortet.
  useEffect(() => {
    if (!valgt && !meg) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target instanceof HTMLInputElement) return;
      if (valgt) setValgt(null);
      else setMeg(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [valgt, meg]);

  // ---- Handlinger ----
  const visSted = (rad: KartRad) => {
    const slug = rad[KART.SLUG];
    // Sørg for at stedet er synlig selv om filteret ellers skjuler det.
    if (data && !passerFilter(rad, data, modus, filter)) {
      setSmil(new Set(SMILES));
      if (data.kategorier[rad[KART.KATEGORI]] !== kategori) setKategori("alle");
    }
    setValgt(slug);
    flyTil(slug);
  };

  const velgTreff = (t: SokTreff) => {
    if (t.type === "sted") {
      visSted(t.rad);
    } else if (data) {
      const bbox = kommuneBbox(data, t.nr);
      if (bbox) mapRef.current?.fitBounds(bbox, { padding: 60, maxZoom: 14, duration: 900 });
    }
  };

  const toggleSmil = (s: Smile) => setSmil((cur) => vekslSmil(cur, s, SMILES));

  const nullstillFilter = () => {
    setSmil(new Set(SMILES));
    setKategori("alle");
    // Knappen forsvinner når filteret er nullstilt, så fokus flyttes til filterknappen.
    filterKnappRef.current?.focus();
  };

  const naerMeg = () => {
    if (!("geolocation" in navigator)) {
      setMelding("Nettleseren din støtter ikke posisjon.");
      return;
    }
    setFinnerMeg(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFinnerMeg(false);
        // Kortet virker selv uten bakgrunnskart; kartet zoomes til radiusen når den er regnet ut.
        setValgt(null);
        setNaerRadius(null);
        setMeg({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const map = mapRef.current;
        if (!map) return;
        const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!megMarker.current) {
          const el = document.createElement("div");
          el.className = "kart-meg";
          el.setAttribute("aria-label", "Din posisjon");
          megMarker.current = new maplibregl.Marker({ element: el });
        }
        megMarker.current.setLngLat(lngLat).addTo(map);
      },
      (err) => {
        setFinnerMeg(false);
        setMelding(err.code === err.PERMISSION_DENIED ? "Du må gi tilgang til posisjon for å bruke «Nær meg»." : "Fant ikke posisjonen din. Prøv igjen.");
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  const overraskMeg = () => {
    const f = geojson?.features;
    if (!f?.length) return;
    const slug = f[Math.floor(Math.random() * f.length)].properties.s;
    setValgt(slug);
    flyTil(slug);
  };

  useEffect(() => {
    if (!melding) return;
    const t = setTimeout(() => setMelding(null), 4000);
    return () => clearTimeout(t);
  }, [melding]);

  const antallVist = geojson?.features.length ?? 0;
  const filterAktivt = harAktivtFilter(filter, SMILES.length);
  const antallPerKategori = useMemo(() => {
    const m = new Map<Kategori, number>();
    if (!data) return m;
    for (const r of data.steder) {
      const k = data.kategorier[r[KART.KATEGORI]];
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [data]);
  const antallIKategori = kategori === "alle" ? 0 : (antallPerKategori.get(kategori) ?? 0);
  const kategoriValg = (k: Kategori) => (
    <option key={k} value={k}>
      {KATEGORI_EMOJI[k]} {filterNavn(k)}
      {data ? ` (${(antallPerKategori.get(k) ?? 0).toLocaleString("nb-NO")})` : ""}
    </option>
  );

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" aria-label="Kart over serveringssteder" role="region" />
      </div>

      {!kartfeil && (!kartKlart || !data) && (
        lastefeil ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-paper">
            <p className="card max-w-sm p-5 text-center font-semibold">
              Oi! Klarte ikke å laste kartdata. Sjekk nettet og last siden på nytt. 🙈
            </p>
          </div>
        ) : (
          <KartVenter />
        )
      )}

      {kartfeil && data && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-5 pt-32">
          <div className="card pointer-events-auto max-w-sm space-y-3 p-5 text-center" role="alert">
            <p className="font-semibold">Klarte ikke å laste bakgrunnskartet. Du kan fortsatt søke etter steder og se tilsynene deres.</p>
            <button type="button" className="btn" onClick={() => {
              setKartfeil(false);
              setKartKlart(false);
              setKartForsok((forsok) => forsok + 1);
            }}>Prøv kartet igjen</button>
          </div>
        </div>
      )}

      {/* Søk og filter */}
      <div className="absolute left-2 right-2 top-2 z-20 space-y-2 sm:left-3 sm:right-auto sm:top-3 sm:w-[370px]">
        <Sok indeks={indeks} onVelg={velgTreff} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            ref={filterKnappRef}
            type="button"
            className="btn !px-3 !py-1.5 text-sm"
            aria-expanded={visFilter}
            aria-controls="kart-filter"
            onClick={() => setVisFilter((v) => !v)}
          >
            <span aria-hidden>🎛️</span> {visFilter ? "Skjul filter" : "Filter og forklaring"}
          </button>
          {!visFilter && filterAktivt && (
            <span className="card inline-flex flex-wrap items-center gap-1 !rounded-full px-2 py-1 text-xs font-bold">
              <span className="sr-only">Aktivt filter:</span>
              {smil.size < SMILES.length &&
                SMILES.filter((s) => smil.has(s)).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1">
                    <Smiley kind={s} size={16} />
                    {SMILE_LABEL[s]}
                  </span>
                ))}
              {kategori !== "alle" && (
                <span>
                  {KATEGORI_EMOJI[kategori]} {filterNavn(kategori)}
                </span>
              )}
              <span className="font-semibold tabular-nums text-ink-soft">· {antallVist.toLocaleString("nb-NO")} steder</span>
            </span>
          )}
          {filterAktivt && (
            <button type="button" className="btn !px-3 !py-1.5 text-sm" onClick={nullstillFilter}>
              <span aria-hidden>✖</span> Nullstill filter
            </button>
          )}
        </div>
        <section
          id="kart-filter"
          aria-label="Filter og forklaring"
          className={`card space-y-3 p-4 ${visFilter ? "block" : "hidden"}`}
        >
          <fieldset>
            <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">Farg etter</legend>
            <div className="grid grid-cols-2 gap-1 rounded-full border-2 border-line bg-paper p-1">
              {(Object.keys(MODUS_TEKST) as Modus[]).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-center text-sm font-bold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent ${
                    modus === m ? "bg-ink text-paper" : "hover:bg-card"
                  }`}
                >
                  <input type="radio" name="modus" value={m} checked={modus === m} onChange={() => setModus(m)} className="sr-only" />
                  {MODUS_TEKST[m].navn}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{MODUS_TEKST[modus].hjelp}</p>
          </fieldset>

          <div>
            <div role="group" aria-label="Vis smilefjes" className="flex flex-wrap gap-1.5">
              {SMILES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={smil.has(s)}
                  onClick={() => toggleSmil(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 border-line py-1 pl-1 pr-2.5 text-sm font-bold transition ${
                    smil.has(s) ? "bg-card shadow-[2px_2px_0_var(--shadow-ink)]" : "bg-paper opacity-50"
                  }`}
                >
                  <Smiley kind={s} size={22} />
                  {SMILE_LABEL[s]}
                  <span className="font-semibold tabular-nums text-ink-soft">{telling[s].toLocaleString("nb-NO")}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              {smil.size === SMILES.length
                ? "Trykk på et fjes for å vise bare det."
                : "Trykk på flere fjes for å kombinere."}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <span className="shrink-0">Vis</span>
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value as Kategori | "alle")}
                className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-3 py-1.5 font-semibold text-ink"
              >
                <option value="alle">🍴 Alle steder</option>
                <optgroup label="Hva slags mat">{KJOKKEN_KATEGORIER.map(kategoriValg)}</optgroup>
                <optgroup label="Hva slags sted">{STEDTYPE_KATEGORIER.map(kategoriValg)}</optgroup>
              </select>
            </label>
            {kategori !== "alle" && (
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                {antallIKategori.toLocaleString("nb-NO")} steder. Mattilsynet oppgir ikke type, så den kommer fra
                Enhetsregisteret og OpenStreetMap, og fra navnet der de ikke sier noe.{" "}
                {kategori === "restaurant"
                  ? "Dette er restauranter der ingen av kildene sier hva slags mat de lager."
                  : "Restauranter der ingen kilde sier hva slags mat de lager, ligger under «Andre restauranter»."}
              </p>
            )}
          </div>

          <p className="text-xs leading-relaxed text-ink-soft">
            Fjesene i klyngene viser humøret i området: bredt glis når nesten alle har smil, sur munn når mange ikke har det.
          </p>

          <p className="text-xs text-ink-soft" aria-live="polite">
            Viser <strong className="text-ink">{antallVist.toLocaleString("nb-NO")}</strong> av{" "}
            {(data?.steder.length ?? 0).toLocaleString("nb-NO")} steder
          </p>
        </section>
      </div>

      {/* Handlingsknapper */}
      <div className={`absolute bottom-8 left-2 z-10 flex gap-2 sm:left-3 ${valgt || meg ? "max-sm:hidden" : ""}`}>
        <button type="button" className="btn text-sm" onClick={naerMeg} disabled={finnerMeg}>
          {finnerMeg ? "⏳ Finner deg…" : "📍 Nær meg"}
        </button>
        <button type="button" className="btn text-sm" onClick={overraskMeg} title="Vis et tilfeldig sted blant de som vises">
          🎲 Overrask meg
        </button>
      </div>

      {melding && (
        <p role="alert" className="card absolute bottom-24 left-1/2 z-30 -translate-x-1/2 px-4 py-2 text-sm font-semibold">
          {melding}
        </p>
      )}

      {naerDom && meg && (
        <NaerMegKort
          key={`${meg.lat},${meg.lng}`}
          dom={naerDom}
          punkt={meg}
          auto={naerRadius === null}
          modus={modus}
          kategori={kategori}
          skjult={!!valgt}
          onRadius={setNaerRadius}
          onVelg={visSted}
          onLukk={() => setMeg(null)}
        />
      )}

      {valgt && <StedPanel slug={valgt} onLukk={() => setValgt(null)} />}
    </div>
  );
}
