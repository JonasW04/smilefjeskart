import { describe, expect, it } from "vitest";
import { lagFasit, type ArkivertSpaadom } from "@/lib/prediksjon/fasit";
import { forberedTilsyn } from "@/lib/prediksjon/historikk";
import { aucIntervall } from "@/lib/prediksjon/metrikker";
import { dagnr } from "@/lib/prediksjon/tid";
import type { Tilsyn } from "@/lib/types";

function spaadom(dataDato: string, steder: ArkivertSpaadom["steder"], generert = dataDato + "T12:00:00.000Z"): ArkivertSpaadom {
  return {
    dataDato, generert, steder, horisont: 60,
    rytme: [{ fra: 0, til: 30, andel: 0.01, n: 100 }, { fra: 30, til: 60, andel: 0.2, n: 100 }, { fra: 60, til: 90, andel: 0.5, n: 100 }],
    etterSiste: [{ karakter: 0, andel: 0.1, n: 90 }, { karakter: 2, andel: 0.4, n: 10 }],
  };
}

const t = (dato: string, karakter = 0, oppfolging = false): Tilsyn => ({ dato, karakter, temaer: [karakter, 0, 0, 0], oppfolging });
const kart = (rader: Array<[string, Tilsyn[]]>) => new Map(rader.map(([slug, tilsyn]) => [slug, forberedTilsyn([t("2025-06-01"), ...tilsyn])]));
const rader: ArkivertSpaadom["steder"] = ["A", "B", "C", "D", "E"].map((slug) => [slug, 200, 100]);
const grenser = kart([
  ["A", [t("2026-01-11", -1)]], ["B", [t("2026-03-11")]], ["C", [t("2026-03-12")]],
  ["D", [t("2026-01-10")]], ["E", [t("2026-01-20", 0, true)]],
]);
const juni = dagnr("2026-06-01");

describe("lagFasit", () => {
  it("gir null uten eldre spådommer", () => {
    expect(lagFasit([], grenser, juni)).toBeNull();
    expect(lagFasit([spaadom("2026-06-01", rader), spaadom("2026-06-02", rader)], grenser, juni)).toBeNull();
  });

  it("beholder sist genererte spådom for hver datadato", () => {
    const siste = spaadom("2026-01-10", rader.map(([slug]) => [slug, 900, 100]), "2026-01-10T18:00:00.000Z");
    const tidlig = spaadom("2026-01-10", rader.map(([slug]) => [slug, 100, 100]));
    for (const arkiv of [[siste, tidlig], [tidlig, siste]]) {
      const f = lagFasit(arkiv, grenser, juni)!;
      expect(f.antallSpaadommer).toBe(1);
      expect(f.besok[0].forventet).toBeCloseTo(4.5);
    }
  });

  it("teller ordinære besøk fra dagen etter til og med siste dag", () => {
    const v = lagFasit([spaadom("2026-01-10", rader)], grenser, juni)!.besok[0];
    expect(v).toMatchObject({ treff: 2, n: 5, lukket: true, dager: 60, til: "2026-03-11" });
    // Rytmeheuristikken: D hadde tilsyn dagen før (bøtte 0–30), de andre for 224 dager siden (siste bøtte).
    expect(v.heuristikk.snittPredikert).toBeCloseTo((4 * 0.5 + 0.01) / 5);
  });

  it("teller bare observerte dager og venter på etterslepet før lukking", () => {
    const arkiv = [spaadom("2026-01-10", rader)];
    expect(lagFasit(arkiv, grenser, dagnr("2026-01-30"))!.besok[0]).toMatchObject({ dager: 20, lukket: false, treff: 1 });
    expect(lagFasit(arkiv, grenser, dagnr("2026-01-10") + 66)!.besok[0].lukket).toBe(false);
    expect(lagFasit(arkiv, grenser, dagnr("2026-01-10") + 67)!.besok[0].lukket).toBe(true);
  });

  it("tar den første spådommen i hver måned og sorterer arkivet", () => {
    const arkiv = ["2026-02-01", "2026-01-11", "2026-01-10"].map((dato) => spaadom(dato, rader));
    expect(lagFasit(arkiv, grenser, juni)!.besok.map((v) => v.fra)).toEqual(["2026-01-10", "2026-02-01"]);
  });

  it("bruker siste spådom strengt før tilsynsdagen", () => {
    const arkiv = [spaadom("2026-01-10", [["A", 200, 100], ["B", 200, 100]]), spaadom("2026-01-12", [["A", 200, 900], ["B", 200, 900]])];
    const u = lagFasit(arkiv, kart([["A", [t("2026-01-12", 2)]], ["B", [t("2026-01-13")]]]), juni)!.utfall!;
    expect(u.n).toBe(2);
    expect(u.treff).toBe(1);
    expect(u.modell.snittPredikert).toBeCloseTo(0.5);
    expect(u.modell.auc).toBe(0);
  });

  it("holder steder uten spådom, oppfølging og ukjent karakter utenfor utfall", () => {
    const tilsyn = kart([["A", [t("2026-01-12", 2), t("2026-01-14", 2, true), t("2026-01-15", -1)]], ["B", [t("2026-01-13")]], ["C", [t("2026-01-13", 2)]]]);
    const u = lagFasit([spaadom("2026-01-10", [["A", 200, 100], ["B", 200, 100]])], tilsyn, juni)!.utfall!;
    expect(u.utenSpaadom).toBe(1);
    expect(u.n).toBe(2);
  });

  it("leter ikke lenger bak når stedet mangler i siste spådom", () => {
    const arkiv = [spaadom("2026-01-10", [["A", 200, 100], ["B", 200, 100], ["C", 200, 100]]), spaadom("2026-01-11", [["A", 200, 100], ["B", 200, 100]])];
    const u = lagFasit(arkiv, kart([["A", [t("2026-01-12", 2)]], ["B", [t("2026-01-12")]], ["C", [t("2026-01-12", 2)]]]), juni)!.utfall!;
    expect(u.utenSpaadom).toBe(1);
    expect(u.n).toBe(2);
  });

  it("bruker forrige ordinære karakter som utfallsheuristikk", () => {
    const tilsyn = kart([["A", [t("2026-01-09", 2), t("2026-01-12", 2)]], ["B", [t("2026-01-13")]]]);
    const u = lagFasit([spaadom("2026-01-10", [["A", 200, 100], ["B", 200, 100]])], tilsyn, juni)!.utfall!;
    expect(u.heuristikk.snittPredikert).toBeCloseTo(0.25);
    expect(u.grunnrate).toMatchObject({ auc: 0.5, brierSkill: 0, toppDesil: 0.5 });
  });
});

describe("aucIntervall", () => {
  it("gir forventet intervall og kapper til null og én", () => {
    const [lav, hoy] = aucIntervall(0.5, 100, 100);
    expect(lav).toBeCloseTo(0.4198, 3);
    expect(hoy).toBeCloseTo(0.5802, 3);
    const [nedre, ovre] = aucIntervall(0.99, 3, 3);
    expect(nedre).toBeGreaterThanOrEqual(0);
    expect(ovre).toBeLessThanOrEqual(1);
  });
});
