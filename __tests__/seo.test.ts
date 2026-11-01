import type { MetadataRoute } from "next";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { merkeSnippet, stedBrodsmulerLd, stedTittel } from "@/lib/seo";
import type { Sted, Tilsyn } from "@/lib/types";

function lagSted(
  felter: Omit<Partial<Sted>, "tilsyn"> & { tilsyn: Array<Pick<Tilsyn, "dato" | "karakter">> },
): Sted {
  return {
    id: "1",
    slug: "kafe-x",
    navn: "Kafé X",
    orgnr: null,
    adresse: "",
    postnr: "",
    poststed: "",
    kommunenr: null,
    kommune: null,
    fylkenr: null,
    fylke: null,
    kjede: null,
    kjedeSlug: null,
    kategori: "annet",
    lng: null,
    lat: null,
    ...felter,
    tilsyn: felter.tilsyn.map((t) => ({ ...t, temaer: [0, 0, 0, 0], oppfolging: false })),
  };
}

describe("stedTittel", () => {
  it("setter sted og smilefjes først", () => {
    const s = lagSted({
      navn: "1. Etage",
      poststed: "Sandefjord",
      kommune: "Sandefjord",
      tilsyn: [{ dato: "2025-02-19", karakter: 1 }],
    });
    expect(stedTittel(s)).toBe("Smilefjes for 1. Etage, Sandefjord: smil | Smilefjeskartet");
  });

  it("bruker kommunen når poststed mangler", () => {
    const s = lagSted({
      navn: "Kafé X",
      poststed: "",
      kommune: "Oslo",
      tilsyn: [{ dato: "2025-02-19", karakter: 1 }],
    });
    expect(stedTittel(s)).toBe("Smilefjes for Kafé X, Oslo: smil | Smilefjeskartet");
  });

  it("dropper sted og karakter når begge mangler", () => {
    const s = lagSted({ navn: "Kafé X", tilsyn: [{ dato: "2025-02-19", karakter: -1 }] });
    expect(stedTittel(s)).toBe("Smilefjes for Kafé X | Smilefjeskartet");
  });
});

describe("merkeSnippet", () => {
  it("escaper navnet og lenker til merket", () => {
    const s = lagSted({ navn: `Bar & "Grill"`, slug: "bar-grill", tilsyn: [{ dato: "2025-02-19", karakter: 1 }] });
    const snippet = merkeSnippet(s);
    expect(snippet).toContain(`alt="Se smilefjeset til Bar &amp; &quot;Grill&quot; på smilefjeskartet.no"`);
    expect(snippet).toContain(`href="https://smilefjeskartet.no/sted/bar-grill"`);
    expect(snippet).toContain(`src="https://smilefjeskartet.no/sted/bar-grill/merke.png"`);
  });

  it("escaper < og > i navnet", () => {
    const s = lagSted({ navn: "<b>Kafé</b>", slug: "kafe", tilsyn: [{ dato: "2025-02-19", karakter: 1 }] });
    expect(merkeSnippet(s)).toContain(`alt="Se smilefjeset til &lt;b&gt;Kafé&lt;/b&gt; på smilefjeskartet.no"`);
  });
});

describe("stedBrodsmulerLd", () => {
  const smuler = (ld: ReturnType<typeof stedBrodsmulerLd>) => ld.itemListElement.map((e) => `${e.position} ${e.name} ${e.item}`);

  it("går fra kartet via fylke og kommune til stedet", () => {
    const s = lagSted({ navn: "67 Grill", slug: "67-grill-lillestrom", fylke: "Akershus", kommune: "Lillestrøm", tilsyn: [{ dato: "2025-02-19", karakter: 1 }] });
    const ld = stedBrodsmulerLd(s, "akershus", "lillestrom");
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(smuler(ld)).toEqual([
      "1 Kart https://smilefjeskartet.no/",
      "2 Akershus https://smilefjeskartet.no/fylke/akershus",
      "3 Lillestrøm https://smilefjeskartet.no/kommune/lillestrom",
      "4 67 Grill https://smilefjeskartet.no/sted/67-grill-lillestrom",
    ]);
  });

  it("viser Oslo én gang når kommune og fylke heter det samme", () => {
    const s = lagSted({ navn: "Kafé X", slug: "kafe-x", fylke: "Oslo", kommune: "Oslo", tilsyn: [{ dato: "2025-02-19", karakter: 1 }] });
    expect(smuler(stedBrodsmulerLd(s, "oslo", "oslo"))).toEqual([
      "1 Kart https://smilefjeskartet.no/",
      "2 Oslo https://smilefjeskartet.no/fylke/oslo",
      "3 Kafé X https://smilefjeskartet.no/sted/kafe-x",
    ]);
  });

  it("hopper over ledd uten egen side", () => {
    const s = lagSted({ navn: "Kafé X", slug: "kafe-x", fylke: "Akershus", kommune: "Lillestrøm", tilsyn: [{ dato: "2025-02-19", karakter: 1 }] });
    expect(smuler(stedBrodsmulerLd(s, null, null))).toEqual(["1 Kart https://smilefjeskartet.no/", "2 Kafé X https://smilefjeskartet.no/sted/kafe-x"]);
  });
});

/** Mønster i robots.txt som regex: * er hva som helst, $ til slutt låser enden. */
function robotsRegex(monster: string): RegExp {
  const ende = monster.endsWith("$");
  const kropp = (ende ? monster.slice(0, -1) : monster)
    .split("*")
    .map((del) => del.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${kropp}${ende ? "$" : ""}`);
}

/** Googles regel: det lengste mønsteret som treffer vinner, og allow vinner ved likt. */
function tillatt(r: MetadataRoute.Robots, sti: string): boolean {
  const regel = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const liste = (v?: string | string[]) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const lengste = (monstre: string[]) => Math.max(-1, ...monstre.filter((m) => robotsRegex(m).test(sti)).map((m) => m.length));
  return lengste(liste(regel.allow)) >= lengste(liste(regel.disallow));
}

describe("robots", () => {
  const r = robots();

  it.each([
    "/",
    "/sted/67-grill-oslo",
    "/sted/67-grill-oslo/merke.png",
    "/kommune",
    "/kommune/oslo",
    "/fylke/rogaland",
    "/kjede/egon",
    "/siste",
    "/siste/rss.xml",
    "/analyse/kommuner.csv",
    "/data/kart.json",
    "/sitemap.xml",
  ])("lar Google hente %s", (sti) => {
    expect(tillatt(r, sti)).toBe(true);
  });

  it.each([
    "/?_rsc=xS921uIzRn4TqtXQ",
    "/siste?_rsc=P1ePAXgRlx32dPjV",
    "/kommune/oslo?_rsc=2cp5NKPS40nawLAX",
    "/?sted=67-grill-oslo",
    "/?sted=67-grill-oslo&_rsc=abc",
    "/api/sted/67-grill-oslo",
  ])("stenger %s", (sti) => {
    expect(tillatt(r, sti)).toBe(false);
  });

  it("gjelder alle søkemotorer og peker på sitemapen", () => {
    expect(Array.isArray(r.rules) ? r.rules.length : 1).toBe(1);
    expect(Array.isArray(r.rules) ? r.rules[0].userAgent : r.rules.userAgent).toBe("*");
    expect(r.sitemap).toBe("https://smilefjeskartet.no/sitemap.xml");
  });
});
