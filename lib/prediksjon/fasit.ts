/** Sjekker publiserte spådommer mot tilsynene som faktisk kom etterpå. */
import { historikkFoer, ordinaerMellom, type TilsynDag } from "./historikk";
import { aucIntervall, brier, evaluer } from "./metrikker";
import { dagnr, forsteIkkeMindre, isoFraDagnr } from "./tid";
import type { Fasit, FasitBesokVindu, FasitMaal, PrediksjonData } from "./typer";

export const ETTERSLEP = 7;

/** Det fasiten trenger fra én publisert generated/prediksjon.json. */
export type ArkivertSpaadom = {
  dataDato: string;
  generert: string;
  horisont: number;
  rytme: PrediksjonData["besok"]["rytme"];
  etterSiste: PrediksjonData["utfall"]["etterSiste"];
  steder: PrediksjonData["steder"];
};

function maal(y: number[], p: number[], heur: number[], ref: number[]): FasitMaal {
  const brierRef = brier(y, ref);
  const grunnrate = evaluer(y, ref, brierRef);
  const modell = evaluer(y, p, brierRef);
  const treff = y.reduce((a, b) => a + b, 0);
  return {
    n: y.length, treff, modell, heuristikk: evaluer(y, heur, brierRef),
    grunnrate: { ...grunnrate, auc: 0.5, brierSkill: 0, toppDesil: grunnrate.snittFaktisk },
    aucIntervall: aucIntervall(modell.auc, treff, y.length - treff),
  };
}

function grunnrate(rader: Array<{ andel: number; n: number }>): number {
  return rader.reduce((s, r) => s + r.andel * r.n, 0) / rader.reduce((s, r) => s + r.n, 0);
}

export function lagFasit(
  arkiv: readonly ArkivertSpaadom[],
  tilsyn: ReadonlyMap<string, readonly TilsynDag[]>,
  dataDag: number,
): Fasit | null {
  // Tommelfingerreglene leser historikken slik den er i dag, også tilsyn som ble publisert etter spådommen.
  // Det hjelper reglene og ikke modellen, så sammenligningen heller i modellens disfavør.
  const unike = new Map<string, ArkivertSpaadom>();
  for (const s of arkiv) {
    if (dagnr(s.dataDato) >= dataDag) continue;
    const gammel = unike.get(s.dataDato);
    if (!gammel || s.generert > gammel.generert) unike.set(s.dataDato, s);
  }
  const spaadommer = [...unike.values()].sort((a, b) => a.dataDato.localeCompare(b.dataDato));
  if (spaadommer.length === 0) return null;
  const spaadomsdager = spaadommer.map((s) => dagnr(s.dataDato));
  const oppslag = spaadommer.map((s) => new Map(s.steder.map(([slug, b, u]) => [slug, { besok: b / 1000, utfall: u / 1000 }])));
  const besok: FasitBesokVindu[] = [];
  const maaneder = new Set<string>();
  for (const s of spaadommer) {
    const maaned = s.dataDato.slice(0, 7);
    if (maaneder.has(maaned)) continue;
    maaneder.add(maaned);
    const dD = dagnr(s.dataDato);
    const dager = Math.min(s.horisont, dataDag - dD);
    const y: number[] = [], p: number[] = [], heur: number[] = [], ref: number[] = [];
    const g = grunnrate(s.rytme);
    const bredde = s.rytme[0].til - s.rytme[0].fra;
    for (const [slug, b] of s.steder) {
      const t = tilsyn.get(slug);
      if (!t) continue;
      const h = historikkFoer(t, dD + 1);
      if (!h) continue;
      y.push(ordinaerMellom(t, dD + 1, dD + dager + 1) ? 1 : 0);
      p.push(b / 1000);
      heur.push(s.rytme[Math.min(s.rytme.length - 1, Math.floor(h.dagerSidenOrdinaer / bredde))].andel);
      ref.push(g);
    }
    const treff = y.reduce((a, b) => a + b, 0);
    if (y.length === 0 || treff === 0 || treff === y.length) continue;
    besok.push({
      ...maal(y, p, heur, ref), fra: s.dataDato, til: isoFraDagnr(dD + s.horisont), dager,
      lukket: dataDag - dD >= s.horisont + ETTERSLEP, forventet: p.reduce((a, b) => a + b, 0),
    });
  }

  const y: number[] = [], p: number[] = [], heur: number[] = [], ref: number[] = [];
  let utenSpaadom = 0;
  const grunnrater = spaadommer.map((s) => grunnrate(s.etterSiste));
  for (const [slug, t] of tilsyn) {
    for (const x of t) {
      if (x.oppfolging || x.karakter < 0 || x.dag <= spaadomsdager[0] || x.dag > dataDag) continue;
      const i = forsteIkkeMindre(spaadomsdager, x.dag) - 1;
      const rad = oppslag[i].get(slug);
      if (!rad) {
        utenSpaadom++;
        continue;
      }
      const g = grunnrater[i];
      const k = historikkFoer(t, x.dag)?.sisteOrdinaerKarakter;
      y.push(x.karakter >= 2 ? 1 : 0);
      p.push(rad.utfall);
      heur.push(spaadommer[i].etterSiste.find((r) => r.karakter === k)?.andel ?? g);
      ref.push(g);
    }
  }
  const treff = y.reduce((a, b) => a + b, 0);
  const utfall = y.length === 0 || treff === 0 || treff === y.length ? null : { ...maal(y, p, heur, ref), utenSpaadom };
  return { dataDato: isoFraDagnr(dataDag), forste: spaadommer[0].dataDato, antallSpaadommer: spaadommer.length, besok, utfall };
}
