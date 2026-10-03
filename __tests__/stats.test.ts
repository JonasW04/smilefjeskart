import { describe, expect, it } from "vitest";
import { kindFromKarakter, smileySvg } from "@/lib/smiley";
import { andel, formatDato, ordinaerFordeling, prosent, stedStats, tidSiden } from "@/lib/stats";
import type { Sted, Tilsyn } from "@/lib/types";

const t = (dato: string, karakter: number, oppfolging = false): Tilsyn => ({ dato, karakter, temaer: [karakter, 0, 0, 0], oppfolging });

function sted(tilsyn: Tilsyn[]): Sted {
  return {
    id: "x", slug: "x", navn: "X", orgnr: null, adresse: "", postnr: "", poststed: "", kommunenr: null, kommune: null,
    fylkenr: null, fylke: null, kjede: null, kjedeSlug: null, kategori: "annet", lng: null, lat: null, tilsyn,
  };
}

describe("stats", () => {
  const a = sted([t("2020-01-01", 2), t("2020-01-10", 0, true), t("2021-01-01", 0), t("2022-01-01", 1), t("2023-01-01", 3), t("2023-01-04", 0, true)]);

  it("ignores follow-up inspections in ordinary distribution", () => {
    const f = ordinaerFordeling([a]);
    expect(f).toEqual({ smil: 2, strek: 1, sur: 1, total: 4 });
    expect(andel(f, "smil")).toBe(0.5);
  });

  it("summarises a place", () => {
    const s = stedStats(a);
    expect(s.antall).toBe(6);
    expect(s.antallOppfolging).toBe(2);
    expect(s.lengsteSmilRekke).toBe(3);
    expect(s.forste).toBe("2020-01-01");
  });

  it("formats Norwegian dates and relative time", () => {
    expect(formatDato("2026-01-14")).toBe("14. jan. 2026");
    const naa = new Date("2026-10-04");
    expect(tidSiden("2026-10-04", naa)).toBe("i dag");
    expect(tidSiden("2026-09-24", naa)).toBe("for 10 dager siden");
    expect(tidSiden("2025-10-01", naa)).toBe("for ett år siden");
    expect(tidSiden("2023-01-01", naa)).toBe("for 3 år siden");
    expect(prosent(0.853)).toMatch(/^85\s%$/);
  });
});

describe("smiley", () => {
  it("maps karakter to face", () => {
    expect([0, 1, 2, 3, 4, -1].map(kindFromKarakter)).toEqual(["smil", "smil", "strek", "sur", "ukjent", "ukjent"]);
  });

  it("renders standalone svg", () => {
    const svg = smileySvg("sur", 32);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="32"/);
    expect(svg).toContain("#F04E5A");
  });
});
