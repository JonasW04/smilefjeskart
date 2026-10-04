"use client";

import * as maplibregl from "maplibre-gl";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

if (typeof window !== "undefined") {
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}
import Smiley from "@/components/Smiley";
import { KATEGORI_EMOJI, KATEGORI_NAVN, type Kategori } from "@/lib/classify";
import {
  byggSokIndeks,
  kommuneBbox,
  lesUrl,
  passerFilter,
  radGruppe,
  skrivUrl,
  spredKoordinater,
  tilGeoJson,
  type Modus,
  type SokTreff,
  type StedProps,
} from "@/lib/kart";
import { SMILES, SMILE_LABEL, type Smile } from "@/lib/smile";
import { KART, type KartData } from "@/lib/types";
import { klyngeElement, leggTilLag, leggTilSmilefjes, settModus, STIL_URL, tilpassGrunnkart } from "./kartStil";
import Sok from "./Sok";
import StedPanel from "./StedPanel";

const KATEGORIER = Object.keys(KATEGORI_NAVN) as Kategori[];

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
  const [data, setData] = useState<KartData | null>(null);
  const [lastefeil, setLastefeil] = useState(false);
  const [modus, setModus] = useState<Modus>(start.modus);
  const [smil, setSmil] = useState<Set<Smile>>(start.smil);
  const [kategori, setKategori] = useState<Kategori | "alle">(start.kategori);
  const [valgt, setValgt] = useState<string | null>(start.sted);
  const [kartKlart, setKartKlart] = useState(false);
  const [kartfeil, setKartfeil] = useState(false);
  const [kartForsok, setKartForsok] = useState(0);
  const [visFilter, setVisFilter] = useState(false);
  const [finnerMeg, setFinnerMeg] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
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
        bounds: NORGE,
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
  }, [data, kartForsok, nullstillKlynger, oppdaterKlynger]);

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

  // Fly til sted fra URL når kartet er klart.
  useEffect(() => {
    if (!kartKlart || harFloyddStart.current) return;
    harFloyddStart.current = true;
    if (start.sted) flyTil(start.sted);
  }, [kartKlart, start.sted, flyTil]);

  // Escape lukker panelet.
  useEffect(() => {
    if (!valgt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) setValgt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [valgt]);

  // ---- Handlinger ----
  const velgTreff = (t: SokTreff) => {
    if (t.type === "sted") {
      const slug = t.rad[KART.SLUG];
      // Sørg for at stedet er synlig selv om filteret ellers skjuler det.
      if (data && !passerFilter(t.rad, data, modus, filter)) {
        setSmil(new Set(SMILES));
        setKategori("alle");
      }
      setValgt(slug);
      flyTil(slug);
    } else if (data) {
      const bbox = kommuneBbox(data, t.nr);
      if (bbox) mapRef.current?.fitBounds(bbox, { padding: 60, maxZoom: 14, duration: 900 });
    }
  };

  const toggleSmil = (s: Smile) => {
    setSmil((cur) => {
      const neste = new Set(cur);
      if (neste.has(s)) neste.delete(s);
      else neste.add(s);
      return neste.size === 0 ? new Set(SMILES) : neste;
    });
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
        map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 14.5), duration: 900 });
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

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" aria-label="Kart over serveringssteder" role="region" />
      </div>

      {!kartfeil && (!kartKlart || !data) && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-paper">
          {lastefeil ? (
            <p className="card max-w-sm p-5 text-center font-semibold">
              Oi! Klarte ikke å laste kartdata. Sjekk nettet og last siden på nytt. 🙈
            </p>
          ) : (
            <div className="text-center" role="status">
              <div className="flex justify-center gap-2" aria-hidden>
                {(["smil", "strek", "sur"] as const).map((k, i) => (
                  <span key={k} className="inline-block animate-bounce" style={{ animationDelay: `${i * 150}ms` }}>
                    <Smiley kind={k} size={44} />
                  </span>
                ))}
              </div>
              <p className="mt-3 font-display text-lg font-extrabold">Teller smilefjes…</p>
            </div>
          )}
        </div>
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
        <button
          type="button"
          className="btn !px-3 !py-1.5 text-sm sm:hidden"
          aria-expanded={visFilter}
          aria-controls="kart-filter"
          onClick={() => setVisFilter((v) => !v)}
        >
          🎛️ {visFilter ? "Skjul filter" : "Filter og forklaring"}
        </button>
        <section
          id="kart-filter"
          aria-label="Filter og forklaring"
          className={`card space-y-3 p-4 ${visFilter ? "block" : "hidden"} sm:block`}
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

          <label className="flex items-center gap-2 text-sm font-semibold">
            <span className="shrink-0">Type sted</span>
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value as Kategori | "alle")}
              className="min-w-0 flex-1 rounded-full border-2 border-line bg-card px-3 py-1.5 font-semibold text-ink"
            >
              <option value="alle">🍴 Alle typer</option>
              {KATEGORIER.map((k) => (
                <option key={k} value={k}>
                  {KATEGORI_EMOJI[k]} {KATEGORI_NAVN[k]}
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-ink-soft" aria-live="polite">
            Viser <strong className="text-ink">{antallVist.toLocaleString("nb-NO")}</strong> av{" "}
            {(data?.steder.length ?? 0).toLocaleString("nb-NO")} steder
          </p>
        </section>
      </div>

      {/* Handlingsknapper */}
      <div className={`absolute bottom-8 left-2 z-10 flex gap-2 sm:left-3 ${valgt ? "max-sm:hidden" : ""}`}>
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

      {valgt && <StedPanel slug={valgt} onLukk={() => setValgt(null)} />}
    </div>
  );
}
