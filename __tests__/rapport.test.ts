import { describe, expect, it } from "vitest";
import {
  bestOgSvakest,
  comebacksIMaaned,
  erYm,
  forrigeMaaned,
  grupperPeriode,
  lagRapport,
  MIN_COMEBACK_DAGER,
  maanedNavn,
  maanedSummer,
  MIN_KOMMUNE_MAANED,
  MIN_KOMMUNER_KAARING,
  ordinaereIMaaned,
  periodeSum,
  rapportMaaneder,
  sisteRapportMaaned,
  sitatTekst,
} from "@/lib/rapport";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, oppfolging = false, temaer: Tilsyn["temaer"] = [0, 0, 0, 0]): Tilsyn => ({
  dato,
  karakter,
  temaer,
  oppfolging,
});

const sted = (slug: string, tilsyn: Tilsyn[], extra: Partial<Sted> = {}): Sted => ({
  id: slug,
  slug,
  navn: slug,
  orgnr: null,
  adresse: "Gata 1",
  postnr: "0150",
  poststed: "OSLO",
  kommunenr: "0301",
  kommune: "Oslo",
  fylkenr: "03",
  fylke: "Oslo",
  kjede: null,
  kjedeSlug: null,
  kategori: "annet",
  lng: 10.7,
  lat: 59.9,
  tilsyn,
  ...extra,
});

describe("måneder", () => {
  it("regner måneder bakover og fram over årsskifter", () => {
    expect(forrigeMaaned("2026-01")).toBe("2025-12");
    expect(forrigeMaaned("2026-10", 12)).toBe("2025-10");
    expect(forrigeMaaned("2026-10", 11)).toBe("2025-11");
    expect(forrigeMaaned("2025-12", -1)).toBe("2026-01");
  });

  it("gir norske månedsnavn og validerer yyyy-mm", () => {
    expect(maanedNavn("2026-10")).toBe("oktober 2026");
    expect(erYm("2026-10")).toBe(true);
    expect(erYm("2026-13")).toBe(false);
    expect(erYm("2026-1")).toBe(false);
  });

  it("venter på Mattilsynets publiseringsforsinkelse før en måned får rapport", () => {
    expect(sisteRapportMaaned("2026-11-17")).toBe("2026-10");
    expect(sisteRapportMaaned("2026-11-07")).toBe("2026-10");
    expect(sisteRapportMaaned("2026-11-06")).toBe("2026-09");
    expect(sisteRapportMaaned("2026-01-03")).toBe("2025-11");
  });
});

describe("maanedSummer og rapportMaaneder", () => {
  const steder = [
    sted("a", [t("2015-03-01", 0), t("2025-10-02", 2), t("2025-10-20", 0, true), t("2026-10-05", 0)]),
    sted("b", [t("2026-10-10", 3), t("2026-10-25", 0, true), t("2026-11-02", 1)]),
  ];
  const summer = maanedSummer(steder);

  it("teller alle tilsyn, men fordeler bare de ordinære", () => {
    const okt = summer.get("2026-10")!;
    expect(okt.alle).toBe(3);
    expect(okt.ordinaer).toEqual({ smil: 1, strek: 0, sur: 1, total: 2 });
    expect(summer.get("2025-10")!.ordinaer).toEqual({ smil: 0, strek: 1, sur: 0, total: 1 });
  });

  it("holder måneder før 2016 utenfor", () => {
    expect(summer.has("2015-03")).toBe(false);
  });

  it("lister bare ferdige måneder med ordinære tilsyn", () => {
    expect(rapportMaaneder(summer, "2026-11-17")).toEqual(["2025-10", "2026-10"]);
    expect(rapportMaaneder(summer, "2026-11-03")).toEqual(["2025-10"]);
  });

  it("summerer en periode av måneder", () => {
    expect(periodeSum(summer, "2025-11", "2026-10")).toEqual({ smil: 1, strek: 0, sur: 1, total: 2 });
    expect(periodeSum(summer, "2025-10", "2026-11").total).toBe(4);
  });
});

describe("comebacksIMaaned", () => {
  const steder = [
    // Sur munn, oppfølging med smil, og smil ved neste ordinære tilsyn: comeback.
    sted("fra-sur", [t("2025-09-01", 3), t("2025-09-20", 0, true), t("2026-10-05", 1)]),
    // Strekmunn sist, smil nå: comeback, men mindre enn fra sur munn.
    sted("fra-strek", [t("2025-08-01", 2), t("2026-10-20", 0)]),
    // Smil sist: ikke comeback.
    sted("stabil", [t("2025-08-01", 0), t("2026-10-21", 0)]),
    // Første tilsyn: ikke comeback.
    sted("ny", [t("2026-10-22", 0)]),
    // Bare oppfølgingen i måneden ga smil: ikke comeback (oppfølging teller ikke).
    sted("oppfolging", [t("2026-09-28", 3), t("2026-10-04", 0, true)]),
    // Ny anmerkning denne måneden: ikke comeback.
    sted("fortsatt-strek", [t("2025-08-01", 3), t("2026-10-11", 2)]),
    // Nytt ordinært tilsyn 19 dager etter sur munn: i praksis en oppfølging, ikke comeback.
    sted("kort-gap", [t("2026-10-01", 3), t("2026-10-20", 0)]),
    // Et tilsyn uten smilefjes (karakter 5) i mellom skjuler ikke strekmunnen før.
    sted("ugradert", [t("2025-01-10", 2), t("2025-06-01", 5), t("2026-10-25", 0)]),
  ];
  const maaned = ordinaereIMaaned(steder, "2026-10");
  const cb = comebacksIMaaned(maaned);

  it("finner steder som gikk fra strek/sur til smil på ordinære tilsyn", () => {
    expect(cb.map((c) => c.sted.slug)).toEqual(["fra-sur", "ugradert", "fra-strek"]);
  });

  it("regner ikke et nytt ordinært tilsyn kort tid etter som comeback", () => {
    expect(MIN_COMEBACK_DAGER).toBe(60);
    expect(cb.some((c) => c.sted.slug === "kort-gap")).toBe(false);
    // Sur munn i måneden står fortsatt på listen over månedens tilsyn.
    expect(maaned.find((m) => m.sted.slug === "kort-gap" && m.tilsyn.karakter === 3)).toBeDefined();
  });

  it("bruker forrige tilsyn med smilefjes som sammenligning", () => {
    expect(cb.find((c) => c.sted.slug === "ugradert")?.forrige?.dato).toBe("2025-01-10");
  });

  it("hopper over oppfølgingstilsyn når forrige tilsyn finnes", () => {
    expect(cb[0].forrige?.dato).toBe("2025-09-01");
    expect(cb[0].forrige?.karakter).toBe(3);
  });

  it("rangerer fra sur munn før fra strekmunn, så karakter 0 før 1", () => {
    const like = comebacksIMaaned(
      ordinaereIMaaned(
        [
          sted("strek-0", [t("2025-01-01", 2), t("2026-10-01", 0)]),
          sted("sur-1", [t("2025-01-01", 3), t("2026-10-01", 1)]),
          sted("sur-0", [t("2025-01-01", 3), t("2026-10-01", 0)]),
        ],
        "2026-10",
      ),
    );
    expect(like.map((c) => c.sted.slug)).toEqual(["sur-0", "sur-1", "strek-0"]);
  });
});

describe("grupperPeriode og bestOgSvakest", () => {
  it("teller ordinære tilsyn og ulike steder i perioden per nøkkel", () => {
    const g = grupperPeriode(
      [
        sted("a", [t("2026-10-01", 0), t("2026-10-15", 2), t("2026-10-30", 0, true), t("2026-09-01", 3)]),
        sted("b", [t("2026-10-02", 0)], { kommunenr: "4601" }),
        sted("c", [t("2026-10-03", 0)], { kommunenr: null }),
      ],
      "2026-10",
      "2026-10",
      (s) => s.kommunenr,
    );
    expect(g.get("0301")).toEqual({ key: "0301", steder: 1, tilsyn: 3, ordinaer: { smil: 1, strek: 1, sur: 0, total: 2 } });
    expect(g.get("4601")?.ordinaer.total).toBe(1);
    expect(g.size).toBe(2);
  });

  it("tar høyst en tredjedel fra hver ende, så midtfeltet står utenfor", () => {
    const femten = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(bestOgSvakest(femten, 5)).toEqual({ best: [1, 2, 3, 4, 5], svakest: [15, 14, 13, 12, 11] });
    expect(bestOgSvakest([...femten, 16, 17, 18], 5).best).toHaveLength(5);
    expect(bestOgSvakest([1, 2, 3, 4, 5, 6], 5)).toEqual({ best: [1, 2], svakest: [6, 5] });
  });

  it("kårer ingen best eller svakest blant færre enn MIN_KOMMUNER_KAARING", () => {
    expect(MIN_KOMMUNER_KAARING).toBe(6);
    expect(bestOgSvakest([1, 2, 3, 4, 5], 5)).toEqual({ best: [], svakest: [] });
    expect(bestOgSvakest([1, 2], 5)).toEqual({ best: [], svakest: [] });
  });
});

describe("lagRapport", () => {
  const mange = (prefiks: string, kommunenr: string, n: number, karakter: number) =>
    Array.from({ length: n }, (_, i) => sted(`${prefiks}-${i}`, [t("2026-10-10", karakter)], { kommunenr }));
  const steder = [
    sted("sur", [t("2026-10-03", 3, false, [3, 0, 2, 0])]),
    sted("strek", [t("2026-10-04", 2)]),
    sted("comeback", [t("2025-10-01", 3), t("2026-10-05", 0)]),
    ...mange("bra", "1103", MIN_KOMMUNE_MAANED, 0),
    ...mange("liten", "5001", MIN_KOMMUNE_MAANED - 1, 3),
  ];
  const summer = maanedSummer(steder);
  const r = lagRapport(steder, summer, "2026-10");

  it("samler månedens tall, sure munner og comebacks", () => {
    expect(r.navn).toBe("oktober 2026");
    expect(r.ordinaer.total).toBe(3 + MIN_KOMMUNE_MAANED + MIN_KOMMUNE_MAANED - 1);
    expect(r.sur.map((x) => x.sted.slug).sort()).toEqual(["sur", ...Array.from({ length: MIN_KOMMUNE_MAANED - 1 }, (_, i) => `liten-${i}`)].sort());
    expect(r.sur.find((x) => x.sted.slug === "sur")?.anmerkninger).toEqual(["Rutiner", "Mathåndtering"]);
    expect(r.strek.map((x) => x.sted.slug)).toEqual(["strek"]);
    expect(r.comebacks.map((x) => x.sted.slug)).toEqual(["comeback"]);
  });

  it("sammenligner med samme måned i fjor og snittet for 12 måneder", () => {
    expect(r.fjor).toEqual({ ym: "2025-10", ordinaer: { smil: 0, strek: 0, sur: 1, total: 1 } });
    expect(r.fra12).toBe("2025-11");
    expect(r.snitt12.total).toBe(r.ordinaer.total);
  });

  it("rangerer bare kommuner over minstegrensen", () => {
    expect(r.kommuner.map((k) => k.key)).toEqual(["1103"]);
  });

  it("gir ingen fjorårstall når måneden mangler", () => {
    expect(lagRapport(steder, summer, "2026-09").fjor).toBeNull();
  });

  it("lager et sitat med tall og kilde", () => {
    const tekst = sitatTekst(r, "https://smilefjeskartet.no/rapport/2026-10");
    expect(tekst).toContain("I oktober 2026 ga Mattilsynet smilefjes ved 22 ordinære tilsyn av serveringssteder.");
    expect(tekst).toContain("mot 0 % i oktober 2025");
    expect(tekst).toContain("10 tilsyn endte med sur munn og 1 med strekmunn.");
    expect(tekst).toContain("Kilde: Smilefjeskartet.no (https://smilefjeskartet.no/rapport/2026-10)");
  });
});
