/**
 * Trener spåmodellene for /prediksjon og skriver generated/prediksjon.json.
 *
 *   npm run build:prediksjon
 *
 * Leser generated/steder.json (lages av build-data). Kjører en rullerende tilbaketest
 * (tre ettårsperioder) og trener deretter på alle data for live-prediksjonene.
 */
import fs from "node:fs";
import path from "node:path";
import type { Kategori } from "../lib/classify";
import { besokRad, utfallRad } from "../lib/prediksjon/egenskaper";
import { historikkFoer } from "../lib/prediksjon/historikk";
import { besokKontekst, utfallKontekst } from "../lib/prediksjon/kontekst";
import { prediker } from "../lib/prediksjon/logistisk";
import { dagnr, isoFraDagnr } from "../lib/prediksjon/tid";
import {
  besokEksempler,
  forberedSteder,
  lagOmraader,
  tilbaketest,
  trenPaa,
  utfallEksempler,
  type Eksempler,
} from "../lib/prediksjon/trening";
import type { PrediksjonData } from "../lib/prediksjon/typer";
import type { Datasett } from "../lib/types";

const ROOT = process.cwd();
const INN = path.join(ROOT, "generated", "steder.json");
const UT = path.join(ROOT, "generated", "prediksjon.json");

const HORISONT = 60;
const START = dagnr("2017-01-01"); // 2016 er første år i datasettet, så historikken er for tynn før dette.
const TESTPERIODER = 3;
const L2 = 5;

const t0 = Date.now();
const logg = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`);

const datasett = JSON.parse(fs.readFileSync(INN, "utf8")) as Datasett;
const dataDag = dagnr(datasett.generert);
/** Live-prediksjonene ser på alt til og med datadagen, og spår fra dagen etter. */
const iMorgen = dataDag + 1;
const steder = forberedSteder(datasett.steder);
const om = lagOmraader(steder);
logg(`Leste ${steder.length} steder, data til ${isoFraDagnr(dataDag)}`);

// ---------------------------------------------------------------------------
// Treningseksempler
// ---------------------------------------------------------------------------
const { eks: besok, snapshots } = besokEksempler(steder, om, START, dataDag, HORISONT);
logg(`Besøk: ${besok.y.length} eksempler fra ${snapshots.length} månedlige skjæringsdatoer`);
const utfall = utfallEksempler(steder, om, START, dataDag);
logg(`Utfall: ${utfall.y.length} ordinære tilsyn`);

/** Siste N ettårsperioder som slutter der fasiten slutter å være kjent. */
function perioder(slutt: number): Array<{ fra: number; til: number }> {
  return Array.from({ length: TESTPERIODER }, (_, i) => ({ fra: slutt - 365 * (TESTPERIODER - i), til: slutt - 365 * (TESTPERIODER - i - 1) }));
}

// Besøk: siste skjæringsdato med kjent fasit er snapshots.at(-1); testperiodene dekker de siste 36 skjæringsdatoene.
const besokPerioder = perioder(snapshots[snapshots.length - 1] + 1);
const besokTest = tilbaketest(besok, besokPerioder, { l2: L2 });
logg(`Besøk tilbaketest: AUC ${besokTest.modell.auc.toFixed(3)} (heuristikk ${besokTest.heuristikk.auc.toFixed(3)})`);

const utfallPerioder = perioder(dataDag + 1);
const utfallTest = tilbaketest(utfall, utfallPerioder, { l2: L2 });
logg(`Utfall tilbaketest: AUC ${utfallTest.modell.auc.toFixed(3)} (heuristikk ${utfallTest.heuristikk.auc.toFixed(3)})`);

const alle = (e: Eksempler) => Int32Array.from({ length: e.y.length }, (_, i) => i);
const besokModell = trenPaa(besok, alle(besok), { l2: L2 });
const utfallModell = trenPaa(utfall, alle(utfall), { l2: L2 });
logg(`Endelige modeller trent (${besokModell.iterasjoner} og ${utfallModell.iterasjoner} Newton-iterasjoner)`);

// ---------------------------------------------------------------------------
// Live-prediksjoner
// ---------------------------------------------------------------------------
const besokKtx = new Map<string, ReturnType<typeof besokKontekst>>();
const utfallKtx = new Map<string, ReturnType<typeof utfallKontekst>>();
const live = steder.map((s) => {
  const h = historikkFoer(s.tilsyn, iMorgen)!;
  const kjede = s.sted.kjedeSlug !== null;
  let bk = besokKtx.get(s.kommune);
  if (!bk) besokKtx.set(s.kommune, (bk = besokKontekst(om, s.kommune, s.fylke, iMorgen)));
  let uk = utfallKtx.get(s.kommune);
  if (!uk) utfallKtx.set(s.kommune, (uk = utfallKontekst(om, s.kommune, s.fylke, iMorgen)));
  return {
    s,
    besok: prediker(besokModell, besokRad(h, s.sted.kategori, kjede, bk)),
    utfall: prediker(utfallModell, utfallRad(h, s.sted.kategori, kjede, uk)),
  };
});

// ---------------------------------------------------------------------------
// Beskrivende tall (fra faktiske data, ikke modellen)
// ---------------------------------------------------------------------------

/** Faktisk andel med ordinært tilsyn innen horisonten, etter dager siden forrige (alle skjæringsdatoer). */
function rytme() {
  const BOETTE = 30;
  const MAKS = 1080;
  const n = new Array(MAKS / BOETTE).fill(0);
  const treff = new Array(MAKS / BOETTE).fill(0);
  for (const S of snapshots) {
    for (const s of steder) {
      const h = historikkFoer(s.tilsyn, S);
      if (!h || h.venterOppfolging || h.dagerSidenOrdinaer >= MAKS) continue;
      const b = Math.floor(h.dagerSidenOrdinaer / BOETTE);
      n[b]++;
      if (s.tilsyn.some((t) => !t.oppfolging && t.dag >= S && t.dag < S + HORISONT)) treff[b]++;
    }
  }
  return n.map((antall, b) => ({ fra: b * BOETTE, til: (b + 1) * BOETTE, andel: antall ? treff[b] / antall : 0, n: antall }));
}

function etterSiste() {
  const m = new Map<number, { n: number; treff: number }>();
  for (let i = 0; i < utfall.y.length; i++) {
    const k = utfall.nokkel[i];
    if (k < 0) continue;
    const e = m.get(k) ?? { n: 0, treff: 0 };
    e.n++;
    e.treff += utfall.y[i];
    m.set(k, e);
  }
  return [...m].sort((a, b) => a[0] - b[0]).map(([karakter, e]) => ({ karakter, andel: e.treff / e.n, n: e.n }));
}

/** Faktisk andel strek/sur ved ordinære tilsyn de siste tre årene, per gruppe. */
function observert(nokkel: (s: (typeof steder)[number]) => string) {
  const m = new Map<string, { n: number; treff: number }>();
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (t.oppfolging || t.karakter < 0 || t.dag < iMorgen - 1096) continue;
      const e = m.get(nokkel(s)) ?? { n: 0, treff: 0 };
      e.n++;
      if (t.karakter >= 2) e.treff++;
      m.set(nokkel(s), e);
    }
  }
  return m;
}

function grupper<K extends string>(nokkel: (s: (typeof steder)[number]) => K) {
  const m = new Map<K, typeof live>();
  for (const l of live) {
    const k = nokkel(l.s);
    const liste = m.get(k);
    if (liste) liste.push(l);
    else m.set(k, [l]);
  }
  return m;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const rundMetrikk = <T extends Record<string, number>>(m: T): T =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, r4(v)])) as T;
const rundRapport = <T extends Omit<PrediksjonData["besok"], "antallSnapshots" | "rytme" | "forventet" | "perFylke">>(r: T) => ({
  ...r,
  modell: rundMetrikk(r.modell),
  grunnrate: rundMetrikk(r.grunnrate),
  heuristikk: rundMetrikk(r.heuristikk),
  kalibrering: r.kalibrering.map(rundMetrikk),
  folder: r.folder.map((f) => ({ ...f, aucModell: r4(f.aucModell), aucHeuristikk: r4(f.aucHeuristikk), snittPredikert: r4(f.snittPredikert), snittFaktisk: r4(f.snittFaktisk) })),
});

const fylkeNavn = new Map(steder.map((s) => [s.fylke, s.sted.fylke ?? "Ukjent fylke"]));
const obsKategori = observert((s) => s.sted.kategori);
const obsFylke = observert((s) => s.fylke);

const data: PrediksjonData = {
  v: 1,
  generert: new Date().toISOString(),
  dataDato: isoFraDagnr(dataDag),
  horisont: HORISONT,
  besok: {
    ...rundRapport({ ...besokTest, nTrening: besok.y.length }),
    antallSnapshots: snapshots.length,
    rytme: rytme().map((r) => ({ ...r, andel: r4(r.andel) })),
    forventet: Math.round(sum(live.map((l) => l.besok))),
    perFylke: [...grupper((s) => s.fylke)]
      .filter(([f]) => f !== "?")
      .map(([fylkenr, l]) => ({ fylkenr, fylke: fylkeNavn.get(fylkenr)!, forventet: Math.round(sum(l.map((x) => x.besok))), steder: l.length }))
      .sort((a, b) => b.forventet - a.forventet),
  },
  utfall: {
    ...rundRapport({ ...utfallTest, nTrening: utfall.y.length }),
    etterSiste: etterSiste().map((r) => ({ ...r, andel: r4(r.andel) })),
    landSnitt: r4(sum(live.map((l) => l.utfall)) / live.length),
    perKategori: [...grupper((s) => s.sted.kategori)]
      .map(([kategori, l]) => {
        const o = obsKategori.get(kategori) ?? { n: 0, treff: 0 };
        return { kategori: kategori as Kategori, snitt: r4(sum(l.map((x) => x.utfall)) / l.length), observert: r4(o.n ? o.treff / o.n : 0), nObservert: o.n, steder: l.length };
      })
      .sort((a, b) => b.snitt - a.snitt),
    perFylke: [...grupper((s) => s.fylke)]
      .filter(([f]) => f !== "?")
      .map(([fylkenr, l]) => {
        const o = obsFylke.get(fylkenr) ?? { n: 0, treff: 0 };
        return { fylkenr, fylke: fylkeNavn.get(fylkenr)!, snitt: r4(sum(l.map((x) => x.utfall)) / l.length), observert: r4(o.n ? o.treff / o.n : 0), nObservert: o.n, steder: l.length };
      })
      .sort((a, b) => b.snitt - a.snitt),
  },
  steder: live
    .map((l): [string, number, number] => [l.s.sted.slug, Math.round(l.besok * 1000), Math.round(l.utfall * 1000)])
    .sort((a, b) => a[0].localeCompare(b[0])),
};

fs.writeFileSync(UT, JSON.stringify(data));
logg(`Skrev ${path.relative(ROOT, UT)} (${(fs.statSync(UT).size / 1024).toFixed(0)} KB)`);
console.log(
  JSON.stringify(
    {
      besok: { modell: data.besok.modell, heuristikk: data.besok.heuristikk, grunnrate: data.besok.grunnrate, folder: data.besok.folder, forventet: data.besok.forventet },
      utfall: { modell: data.utfall.modell, heuristikk: data.utfall.heuristikk, grunnrate: data.utfall.grunnrate, folder: data.utfall.folder, landSnitt: data.utfall.landSnitt },
    },
    null,
    1,
  ),
);
