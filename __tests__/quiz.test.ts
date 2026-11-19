import { describe, expect, it } from "vitest";
import {
  dagensQuiz,
  delingstekst,
  kodQuizData,
  KOMPOSISJONER,
  leggTilDager,
  lesLagret,
  lesQuizData,
  osloDato,
  poengsum,
  QUIZ_LENGDE,
  quizKandidater,
  quizKontekst,
  quizRekke,
  sekunderTilNesteQuiz,
  treffEmoji,
  velgQuiz,
  type QuizSted,
} from "@/lib/quiz";
import type { Smile } from "@/lib/smile";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, temaer: Tilsyn["temaer"] = [0, 0, 0, 0], oppfolging = false): Tilsyn => ({
  dato,
  karakter,
  temaer,
  oppfolging,
});

const sted = (slug: string, tilsyn: Tilsyn[], felter: Partial<Sted> = {}): Sted => ({
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
  ...felter,
});

const KARAKTER: Record<Smile, number> = { smil: 0, strek: 2, sur: 3 };

/** Et realistisk skjevt utvalg: mange smil, en del strekmunn, få sure munner. */
function lagPool(): QuizSted[] {
  const steder: Sted[] = [];
  const legg = (smil: Smile, n: number) => {
    for (let i = 0; i < n; i++) steder.push(sted(`${smil}-${i}`, [t("2025-06-01", 0), t("2026-03-01", KARAKTER[smil])]));
  };
  legg("smil", 400);
  legg("strek", 40);
  legg("sur", 6);
  return quizKandidater(steder, "2026-11-19");
}

const fordeling = (q: QuizSted[]) => ({
  smil: q.filter((s) => s.fasit === "smil").length,
  strek: q.filter((s) => s.fasit === "strek").length,
  sur: q.filter((s) => s.fasit === "sur").length,
});

describe("osloDato", () => {
  it("bytter dag ved midnatt norsk tid, ikke UTC", () => {
    expect(osloDato(new Date("2026-11-18T22:59:59Z"))).toBe("2026-11-18");
    expect(osloDato(new Date("2026-11-18T23:00:00Z"))).toBe("2026-11-19");
  });

  it("følger sommertid", () => {
    expect(osloDato(new Date("2026-06-30T21:59:59Z"))).toBe("2026-06-30");
    expect(osloDato(new Date("2026-06-30T22:00:00Z"))).toBe("2026-07-01");
  });
});

describe("sekunderTilNesteQuiz", () => {
  it("teller ned til midnatt i Norge", () => {
    expect(sekunderTilNesteQuiz(new Date("2026-11-18T23:00:00Z"))).toBe(86_400);
    expect(sekunderTilNesteQuiz(new Date("2026-11-19T22:59:00Z"))).toBe(60);
  });
});

describe("leggTilDager", () => {
  it("håndterer måneds- og årsskifte", () => {
    expect(leggTilDager("2026-12-31", 1)).toBe("2027-01-01");
    expect(leggTilDager("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("quizKandidater", () => {
  it("bruker siste ordinære tilsyn, ikke oppfølgingen", () => {
    const [q] = quizKandidater([sted("a", [t("2026-01-01", 0), t("2026-05-01", 2, [0, 2, 3, 0]), t("2026-05-20", 0, [0, 0, 0, 0], true)])], "2026-11-19");
    expect(q.fasit).toBe("strek");
    expect(q.dato).toBe("2026-05-01");
    expect(q.anmerkninger).toEqual(["Lokaler", "Mathåndtering"]);
    expect(q.forrige).toBe("smil");
    expect(q.oppfolging).toEqual({ dato: "2026-05-20", smil: "smil" });
  });

  it("ser bort fra tilsyn etter datoen, så en dato regnes likt før og etter nye data", () => {
    const s = sted("a", [t("2026-01-01", 0), t("2026-12-01", 3)]);
    expect(quizKandidater([s], "2026-11-19")[0].fasit).toBe("smil");
    expect(quizKandidater([s], "2026-12-01")[0].fasit).toBe("sur");
  });

  it("dropper steder uten kommune, uten karakter eller med for gammelt tilsyn", () => {
    const k = quizKandidater(
      [
        sted("uten-kommune", [t("2026-01-01", 0)], { kommunenr: null, kommune: null }),
        sted("ukjent", [t("2026-01-01", -1)]),
        sted("gammel", [t("2022-01-01", 0)]),
        sted("ok", [t("2026-01-01", 1)]),
      ],
      "2026-11-19",
    );
    expect(k.map((q) => q.slug)).toEqual(["ok"]);
  });

  it("teller smil på rad bakover fra siste ordinære tilsyn", () => {
    const [q] = quizKandidater([sted("a", [t("2022-01-01", 2), t("2023-01-01", 0), t("2024-01-01", 1), t("2025-01-01", 0)])], "2026-11-19");
    expect(q.smilPaRad).toBe(3);
    expect(q.antall).toBe(4);
  });
});

describe("dagensQuiz", () => {
  const pool = lagPool();

  it("gir de samme fem stedene for samme dato", () => {
    const a = dagensQuiz(pool, "2026-11-19").map((q) => q.slug);
    const b = dagensQuiz([...pool].reverse(), "2026-11-19").map((q) => q.slug);
    expect(a).toHaveLength(QUIZ_LENGDE);
    expect(new Set(a).size).toBe(QUIZ_LENGDE);
    expect(b).toEqual(a);
  });

  it("gir andre steder neste dag", () => {
    const a = dagensQuiz(pool, "2026-11-19").map((q) => q.slug);
    const b = dagensQuiz(pool, "2026-11-20").map((q) => q.slug);
    expect(b).not.toEqual(a);
  });

  it("holder utvalget når et sted som ikke ble trukket, forsvinner fra dataene", () => {
    const a = dagensQuiz(pool, "2026-11-19");
    const valgt = new Set(a.map((q) => q.slug));
    const borte = pool.filter((q) => !valgt.has(q.slug)).slice(0, 20).map((q) => q.slug);
    const uten = pool.filter((q) => !borte.includes(q.slug));
    expect(uten.length).toBe(pool.length - 20);
    expect(dagensQuiz(uten, "2026-11-19").map((q) => q.slug)).toEqual(a.map((q) => q.slug));
  });

  it("blander karakterene: minst ett smil og én strekmunn, aldri mer enn tre av en sort", () => {
    let medSur = 0;
    for (let i = 0; i < 60; i++) {
      const f = fordeling(dagensQuiz(pool, leggTilDager("2026-11-19", i)));
      expect(f.smil + f.strek + f.sur).toBe(QUIZ_LENGDE);
      expect(f.smil).toBeGreaterThanOrEqual(1);
      expect(f.strek).toBeGreaterThanOrEqual(1);
      expect(Math.max(f.smil, f.strek, f.sur)).toBeLessThanOrEqual(3);
      if (f.sur > 0) medSur++;
    }
    // Åtte av ti blandinger har sur munn.
    expect(medSur).toBeGreaterThanOrEqual(40);
  });

  it("har bare blandinger med fem steder, minst ett smil og én strekmunn", () => {
    for (const [smil, strek, sur] of KOMPOSISJONER) {
      expect(smil + strek + sur).toBe(QUIZ_LENGDE);
      expect(smil).toBeGreaterThanOrEqual(1);
      expect(strek).toBeGreaterThanOrEqual(1);
    }
  });

  it("foretrekker steder i byene", () => {
    const steder: Sted[] = [];
    for (let i = 0; i < 150; i++) steder.push(sted(`by-${i}`, [t("2026-03-01", 0)]));
    for (let i = 0; i < 150; i++) steder.push(sted(`bygd-${i}`, [t("2026-03-01", 0)], { kommunenr: `99${String(i).padStart(2, "0")}`, kommune: `Bygd ${i}` }));
    const k = quizKandidater(steder, "2026-11-19");
    let by = 0;
    for (let i = 0; i < 40; i++) by += dagensQuiz(k, leggTilDager("2026-11-19", i)).filter((q) => q.storby).length;
    expect(by / (40 * QUIZ_LENGDE)).toBeGreaterThan(0.6);
  });

  it("tar maks ett sted per kjede", () => {
    const steder = Array.from({ length: 30 }, (_, i) => sted(`kjede-${i}`, [t("2026-03-01", i < 10 ? 2 : 0)], { kjede: "Burgerkjeden" }));
    steder.push(...Array.from({ length: 30 }, (_, i) => sted(`fri-${i}`, [t("2026-03-01", i < 10 ? 2 : 0)])));
    const q = dagensQuiz(quizKandidater(steder, "2026-11-19"), "2026-11-19");
    expect(q.filter((s) => s.kjede === "Burgerkjeden").length).toBeLessThanOrEqual(1);
  });

  it("fyller opp med andre karakterer når et område mangler sur munn", () => {
    const k = quizKandidater(
      Array.from({ length: 8 }, (_, i) => sted(`s-${i}`, [t("2026-03-01", 0)])),
      "2026-11-19",
    );
    expect(velgQuiz(k, "ovelse:1", "2026-11-19")).toHaveLength(QUIZ_LENGDE);
  });
});

describe("treffEmoji og delingstekst", () => {
  const runder: Array<{ fasit: Smile; gjett: Smile }> = [
    { fasit: "smil", gjett: "smil" },
    { fasit: "strek", gjett: "strek" },
    { fasit: "strek", gjett: "smil" },
    { fasit: "sur", gjett: "smil" },
    { fasit: "sur", gjett: "sur" },
  ];

  it("viser hvor nær gjetningen var, ikke fasiten", () => {
    expect(runder.map(treffEmoji)).toEqual(["😀", "😀", "😐", "😠", "😀"]);
    expect(poengsum(runder)).toBe(3);
  });

  it("formaterer dagens resultat for deling", () => {
    expect(delingstekst(runder)).toBe("😀😀😐😠😀 3/5 på dagens Smilefjes-quiz! smilefjeskartet.no/quiz");
  });

  it("merker øvingsrunder med området", () => {
    expect(delingstekst(runder, { type: "ovelse", omrade: "Bergen" })).toBe(
      "😀😀😐😠😀 3/5 på Smilefjes-quizen (øvingsrunde: Bergen)! smilefjeskartet.no/quiz",
    );
    expect(delingstekst(runder, { type: "ovelse", omrade: null })).toBe("😀😀😐😠😀 3/5 på Smilefjes-quizen (øvingsrunde)! smilefjeskartet.no/quiz");
  });

  it("røper ikke svarene: samme treff gir samme tekst uansett fasit", () => {
    const smilRiktig = delingstekst(Array(5).fill({ fasit: "smil", gjett: "smil" }));
    const surRiktig = delingstekst(Array(5).fill({ fasit: "sur", gjett: "sur" }));
    expect(smilRiktig).toBe(surRiktig);
  });
});

describe("quizRekke", () => {
  it("teller dager på rad til og med i dag", () => {
    expect(quizRekke({ "2026-11-17": 3, "2026-11-18": 4, "2026-11-19": 5 }, "2026-11-19")).toBe(3);
  });

  it("holder rekka gjennom dagen før dagens quiz er tatt", () => {
    expect(quizRekke({ "2026-11-17": 3, "2026-11-18": 4 }, "2026-11-19")).toBe(2);
  });

  it("starter på null etter en tapt dag", () => {
    expect(quizRekke({ "2026-11-16": 3, "2026-11-17": 4 }, "2026-11-19")).toBe(0);
  });
});

describe("quizKontekst", () => {
  it("forteller om comeback og oppfølging", () => {
    const [comeback, strek] = quizKandidater(
      [
        sted("comeback", [t("2025-01-01", 3), t("2026-01-01", 0)]),
        sted("strek", [t("2025-01-01", 0), t("2026-01-01", 2, [2, 0, 0, 0]), t("2026-01-20", 0, [0, 0, 0, 0], true)]),
      ],
      "2026-11-19",
    );
    expect(quizKontekst(comeback)).toEqual(["Comeback! Hadde sur munn gangen før."]);
    expect(quizKontekst(strek)).toEqual(["Trakk ned: Rutiner.", "Hadde smil gangen før.", "Fikk smil på oppfølgingstilsynet 20. jan. 2026."]);
  });
});

describe("kodQuizData og lesQuizData", () => {
  it("gir tilbake de samme stedene", () => {
    const k = quizKandidater(
      [
        sted("a", [t("2025-01-01", 0), t("2026-01-01", 3, [3, 2, 0, 0]), t("2026-01-10", 2, [0, 2, 0, 0], true)], { kjede: "Kjeden" }),
        sted("b", [t("2026-02-01", 1)], { kommunenr: "4601", kommune: "Bergen", fylke: null }),
      ],
      "2026-11-19",
    );
    expect(lesQuizData(JSON.parse(JSON.stringify(kodQuizData(k, "2026-11-19"))))).toEqual(k);
  });
});

describe("lesLagret", () => {
  it("tåler tomt og ødelagt innhold", () => {
    expect(lesLagret(null)).toEqual({ dag: null, historikk: {} });
    expect(lesLagret("{ikke json")).toEqual({ dag: null, historikk: {} });
    expect(lesLagret(JSON.stringify({ dag: { dato: "2026-11-19", steder: [], gjett: ["smil"] }, historikk: { x: 1, "2026-11-18": 4 } }))).toEqual({
      dag: null,
      historikk: { "2026-11-18": 4 },
    });
  });

  it("leser en gyldig dag", () => {
    const steder = lagPool().slice(0, QUIZ_LENGDE);
    const dag = { dato: "2026-11-19", steder, gjett: ["smil", "sur"] };
    expect(lesLagret(JSON.stringify({ dag, historikk: {} })).dag).toEqual(dag);
  });
});
