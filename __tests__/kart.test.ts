import { describe, expect, it } from "vitest";
import { byggSokIndeks, gruppe, klyngeHumor, kommuneBbox, lesUrl, skrivUrl, sok, spredKoordinater, tilGeoJson, type Filter } from "@/lib/kart";
import type { KartData, KartRad } from "@/lib/types";

const rad = (slug: string, navn: string, adresse: string, lng: number, lat: number, k: number, v: number, kommune: number, kat: number): KartRad =>
  [slug, navn, adresse, lng, lat, k, 20260101, kommune, kat, 3, v, v];

const data: KartData = {
  v: 1,
  generert: "2026-10-04T00:00:00Z",
  kommuner: [["0301", "Oslo", "Oslo"], ["4601", "Bergen", "Vestland"]],
  kategorier: ["annet", "pizza"],
  steder: [
    rad("bolgen-moi-oslo", "Bølgen & Moi", "Kongens gate 1, Oslo", 10.74, 59.91, 0, 0, 0, 0),
    rad("pizza-osloveien", "Pizza Osloveien", "Osloveien 3, Bergen", 5.33, 60.39, 1, 2, 1, 1),
    rad("cafe-x-bergen", "Café X", "Torget 2, Bergen", 5.32, 60.4, 0, 3, 1, 0),
    rad("ukjent-sted", "Ukjent sted", "Gata 9, Oslo", 10.8, 59.95, -1, -1, 0, 0),
  ],
};

const alle: Filter = { smil: new Set(["smil", "strek", "sur"]), kategori: "alle" };

describe("kart geojson", () => {
  it("groups karakter", () => {
    expect([0, 1, 2, 3, 4, -1].map(gruppe)).toEqual([0, 0, 1, 2, 3, 3]);
  });

  it("filters by mode and smile", () => {
    const bareStrek: Filter = { smil: new Set(["strek"]), kategori: "alle" };
    expect(tilGeoJson(data, "tre-aar", bareStrek).features.map((f) => f.properties.s)).toEqual(["pizza-osloveien"]);
    expect(tilGeoJson(data, "siste", bareStrek).features).toHaveLength(0);
    expect(tilGeoJson(data, "siste", alle).features).toHaveLength(4);
    // Ukjente skjules når ikke alle smilefjes er valgt
    expect(tilGeoJson(data, "siste", { smil: new Set(["smil", "strek"]), kategori: "alle" }).features).toHaveLength(3);
  });

  it("filters by kategori", () => {
    expect(tilGeoJson(data, "siste", { ...alle, kategori: "pizza" }).features.map((f) => f.properties.s)).toEqual(["pizza-osloveien"]);
  });

  it("spreads places that share coordinates, deterministically", () => {
    const delt: KartData = {
      ...data,
      steder: [
        rad("a", "A", "", 10, 60, 0, 0, 0, 0),
        rad("b", "B", "", 10, 60, 0, 0, 0, 0),
        rad("c", "C", "", 10, 60, 0, 0, 0, 0),
        rad("d", "D", "", 11, 61, 0, 0, 0, 0),
      ],
    };
    const k = spredKoordinater(delt);
    expect(k.get("d")).toEqual([11, 61]);
    const pts = ["a", "b", "c"].map((s) => k.get(s)!);
    expect(new Set(pts.map((p) => p.join(","))).size).toBe(3);
    for (const [lng, lat] of pts) {
      expect(Math.abs(lng - 10)).toBeLessThan(0.001);
      expect(Math.abs(lat - 60)).toBeLessThan(0.001);
    }
    expect(spredKoordinater(delt).get("b")).toEqual(k.get("b"));
    expect(tilGeoJson(delt, "siste", alle, k).features[1].geometry.coordinates).toEqual(k.get("b"));
  });

  it("computes kommune bbox", () => {
    expect(kommuneBbox(data, "4601")).toEqual([5.32, 60.39, 5.33, 60.4]);
    expect(kommuneBbox(data, "9999")).toBeNull();
  });
});

describe("kart søk", () => {
  const idx = byggSokIndeks(data);

  it("finds by name with or without æøå and accents", () => {
    expect(sok(idx, "bølgen")[0]).toMatchObject({ type: "sted" });
    expect(sok(idx, "bolgen").map((t) => (t.type === "sted" ? t.rad[0] : t.nr))).toContain("bolgen-moi-oslo");
    expect(sok(idx, "cafe x").map((t) => (t.type === "sted" ? t.rad[0] : t.nr))[0]).toBe("cafe-x-bergen");
  });

  it("ranks kommune and name matches above address matches", () => {
    const r = sok(idx, "oslo");
    expect(r[0]).toMatchObject({ type: "kommune", nr: "0301", antall: 2 });
    expect(r.findIndex((t) => t.type === "sted" && t.rad[0] === "pizza-osloveien")).toBeGreaterThan(0);
  });

  it("matches multiple words across name and address", () => {
    expect(sok(idx, "café torget").map((t) => (t.type === "sted" ? t.rad[0] : ""))).toEqual(["cafe-x-bergen"]);
  });

  it("ignores very short queries", () => {
    expect(sok(idx, "o")).toEqual([]);
  });
});

describe("kart url", () => {
  it("round-trips state and drops defaults", () => {
    const t = lesUrl("?sted=abc&modus=siste&kategori=pizza&vis=strek,sur", data.kategorier);
    expect(t.sted).toBe("abc");
    expect(t.modus).toBe("siste");
    expect(t.kategori).toBe("pizza");
    expect([...t.smil]).toEqual(["strek", "sur"]);
    expect(skrivUrl(t)).toBe("?sted=abc&modus=siste&kategori=pizza&vis=strek%2Csur");
    expect(skrivUrl(lesUrl("", data.kategorier))).toBe("");
  });

  it("rejects unknown values", () => {
    const t = lesUrl("?modus=x&kategori=<script>&vis=foo", data.kategorier);
    expect(t.modus).toBe("tre-aar");
    expect(t.kategori).toBe("alle");
    expect(t.smil.size).toBe(3);
  });
});

describe("klyngeHumor", () => {
  it("maps smile share onto -1..1 around the thresholds", () => {
    expect(klyngeHumor(95, 5, 0)).toBeCloseTo(1);
    expect(klyngeHumor(100, 0, 0)).toBe(1);
    expect(klyngeHumor(80, 15, 5)).toBeCloseTo(0);
    expect(klyngeHumor(65, 30, 5)).toBeCloseTo(-1);
    expect(klyngeHumor(1, 9, 0)).toBe(-1);
    expect(klyngeHumor(87, 13, 0)).toBeGreaterThan(0.4);
  });

  it("is null when nothing has a known result", () => {
    expect(klyngeHumor(0, 0, 0)).toBeNull();
  });
});
