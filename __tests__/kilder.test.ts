import { describe, expect, it } from "vitest";
import { lagKildeoppslag, navnLikhet, type BrregFil, type OsmFil, type OsmPost } from "../scripts/lib/kilder";

const LAT = 69.2286;
const LON = 17.9822;
/** Et punkt `nord` meter nord for (LAT, LON). */
const nord = (meter: number): [number, number] => [LAT + meter / 111_320, LON];

const brreg: BrregFil = {
  hentet: "2026-11-20T00:00:00.000Z",
  enheter: { "980656764": { kode: "56.110", navn: "TORVET CAFE & BAR", aktivitet: "Drift av restaurant." } },
};

const oppslag = (steder: OsmPost[]) => lagKildeoppslag(brreg, { hentet: brreg.hentet, steder } satisfies OsmFil);
const sted = (navn: string, over: Partial<{ orgnr: string; poststed: string }> = {}) => ({
  navn,
  orgnr: over.orgnr ?? null,
  lat: LAT,
  lng: LON,
  poststed: over.poststed ?? "Finnsnes",
  kommune: "Senja",
});

describe("navnLikhet", () => {
  it("ser bort fra fyllord og stedsnavn", () => {
    expect(navnLikhet("Egon Porsgrunn v/Norbekk AS", "Egon", new Set(["porsgrunn"])).delvis).toBe(1);
    expect(navnLikhet("Restaurant Frida", "Frida Restaurant")).toEqual({ delvis: 1, helt: 1 });
    expect(navnLikhet("Happy Time Grill", "Happy Time Pizza").helt).toBeLessThan(1);
    expect(navnLikhet("Milano - Finnsnes", "Finnsnes Hotel", new Set(["finnsnes"])).delvis).toBe(0);
    expect(navnLikhet("Restaurant & Bar", "Bar Restaurant").delvis).toBe(0);
  });
});

describe("lagKildeoppslag", () => {
  it("henter næringskode, registernavn og aktivitet fra organisasjonsnummeret", () => {
    const k = oppslag([])(sted("1. Etage - Sandefjord", { orgnr: "980656764" }));
    expect(k).toMatchObject({ naeringskode: "56.110", registernavn: "TORVET CAFE & BAR", aktivitet: "Drift av restaurant.", osm: null });
    expect(oppslag([])(sted("Ukjent", { orgnr: "123456789" })).naeringskode).toBeNull();
  });

  it("kobler et OSM-sted med samme navn i nærheten", () => {
    const k = oppslag([[...nord(40), "Uno", "restaurant", "pizza"]])(sted("Uno Marineholmen"));
    expect(k.osm).toEqual({ type: "restaurant", kjokken: "pizza" });
  });

  it("kobler ikke på stedsnavnet alene, eller på et annet sted i samme kvartal", () => {
    expect(oppslag([[...nord(100), "Finnsnes Hotel", "hotel", null]])(sted("Milano - Finnsnes")).osm).toBeNull();
    expect(oppslag([[...nord(10), "Kebabhuset", "fast_food", "kebab"]])(sted("Milano Pizza")).osm).toBeNull();
  });

  it("tåler lengre avstand når navnet er helt likt, men ikke for delvis like navn", () => {
    expect(oppslag([[...nord(250), "Happy Time Pizza", "fast_food", null]])(sted("Happy Time Pizza")).osm).not.toBeNull();
    expect(oppslag([[...nord(250), "Happy Time Pizza", "fast_food", null]])(sted("Happy Time Grill")).osm).toBeNull();
    expect(oppslag([[...nord(90), "Happy Time Pizza", "fast_food", null]])(sted("Happy Time Grill")).osm).not.toBeNull();
    expect(oppslag([[...nord(400), "Happy Time Pizza", "fast_food", null]])(sted("Happy Time Pizza")).osm).toBeNull();
  });

  it("velger det beste treffet når flere ligger nær", () => {
    const k = oppslag([
      [...nord(20), "Bryggen", "pub", null],
      [...nord(60), "Bryggen Sushi", "restaurant", "sushi"],
    ])(sted("Bryggen Sushi"));
    expect(k.osm?.kjokken).toBe("sushi");
  });

  it("gir ingen OSM-data for steder uten koordinater", () => {
    const k = oppslag([[LAT, LON, "Uno", "restaurant", "pizza"]])({ ...sted("Uno"), lat: null, lng: null });
    expect(k.osm).toBeNull();
  });
});
