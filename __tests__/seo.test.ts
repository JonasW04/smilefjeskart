import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap, { generateSitemaps } from "@/app/sitemap";
import {
  STED_OG_BILDE,
  forhandsbygdeSteder,
  merkeSnippet,
  omradeBrodsmulerLd,
  omradeSmuler,
  sitemapIndeks,
  smilPaaRad,
  stedBeskrivelse,
  stedBrodsmulerLd,
  stedLd,
  stedTittel,
} from "@/lib/seo";
import type { Sted, Tilsyn } from "@/lib/types";

function lagSted(
  felter: Omit<Partial<Sted>, "tilsyn"> & { tilsyn: Array<Pick<Tilsyn, "dato" | "karakter"> & Partial<Tilsyn>> },
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
    tilsyn: felter.tilsyn.map((t) => ({ temaer: [0, 0, 0, 0], oppfolging: false, ...t })),
  };
}

const I_DAG = "2026-11-18";

describe("stedTittel", () => {
  it("leder med navn og sted og viser en fersk sur munn selv om stedet har smil nå", () => {
    const s = lagSted({
      navn: "Cleopatra House",
      poststed: "Oslo",
      tilsyn: [
        { dato: "2023-03-01", karakter: 0 },
        { dato: "2024-05-01", karakter: 1 },
        { dato: "2025-06-01", karakter: 2 },
        { dato: "2026-02-01", karakter: 3 },
        { dato: "2026-03-01", karakter: 0, oppfolging: true },
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Cleopatra House, Oslo – Hadde sur munn i 2026 (nå smil) · 5 tilsyn | Smilefjeskartet");
  });

  it("sier rett ut at siste tilsyn ga strekmunn", () => {
    const s = lagSted({
      navn: "Kafé X",
      poststed: "Bergen",
      tilsyn: [
        { dato: "2024-01-10", karakter: 0 },
        { dato: "2026-10-01", karakter: 2 },
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Kafé X, Bergen – Fikk strekmunn i 2026 · 2 tilsyn | Smilefjeskartet");
  });

  it("viser en ny strekmunn selv om det var sur munn tidligere i perioden", () => {
    const s = lagSted({
      navn: "Kafé X",
      poststed: "Bergen",
      tilsyn: [
        { dato: "2025-05-22", karakter: 3 },
        { dato: "2025-06-22", karakter: 0, oppfolging: true },
        { dato: "2026-11-12", karakter: 2 },
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Kafé X, Bergen – Fikk strekmunn i 2026, sur munn i 2025 · 3 tilsyn | Smilefjeskartet");
  });

  it("viser året for den siste av like dårlige karakterer", () => {
    const s = lagSted({
      navn: "Kafé X",
      poststed: "Bergen",
      tilsyn: [
        { dato: "2024-01-10", karakter: 3 },
        { dato: "2025-01-10", karakter: 3 },
        { dato: "2025-08-10", karakter: 2 },
        { dato: "2026-01-10", karakter: 0 },
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Kafé X, Bergen – Hadde sur munn i 2025 (nå smil) · 4 tilsyn | Smilefjeskartet");
  });

  it("viser rekken med smil når det ikke har vært strekmunn eller sur munn de siste tre årene", () => {
    const s = lagSted({
      navn: "Olivias",
      poststed: "Trondheim",
      tilsyn: [
        { dato: "2019-01-01", karakter: 3 },
        ...["2020", "2021", "2022", "2023", "2024", "2025"].map((aar) => ({ dato: `${aar}-06-01`, karakter: 0 })),
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Olivias, Trondheim – 6 smil på rad hos Mattilsynet | Smilefjeskartet");
  });

  it("hopper over tilsyn uten karakter når rekken telles", () => {
    const s = lagSted({
      tilsyn: [
        { dato: "2024-01-01", karakter: 0 },
        { dato: "2025-01-01", karakter: -1 },
        { dato: "2026-01-01", karakter: 1 },
      ],
    });
    expect(smilPaaRad(s)).toBe(2);
  });

  it("bruker kommunen når poststed mangler", () => {
    const s = lagSted({
      navn: "Kafé X",
      poststed: "",
      kommune: "Oslo",
      tilsyn: [
        { dato: "2025-02-19", karakter: 1 },
        { dato: "2026-02-19", karakter: 1 },
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Kafé X, Oslo – 2 smil på rad hos Mattilsynet | Smilefjeskartet");
  });

  it("røper ikke karakteren når det bare er ett tilsyn med smil", () => {
    const s = lagSted({ navn: "1. Etage", poststed: "Sandefjord", tilsyn: [{ dato: "2025-02-19", karakter: 1 }] });
    expect(stedTittel(s, I_DAG)).toBe("1. Etage, Sandefjord – Smilefjes fra Mattilsynet | Smilefjeskartet");
  });

  it("viser antall tilsyn når siste smil kom etter en gammel strekmunn", () => {
    const s = lagSted({
      navn: "Kafé X",
      tilsyn: [
        { dato: "2020-01-01", karakter: 2 },
        { dato: "2025-01-01", karakter: 0 },
      ],
    });
    expect(stedTittel(s, I_DAG)).toBe("Kafé X – 2 tilsyn hos Mattilsynet | Smilefjeskartet");
  });

  it("dropper stedet når både poststed og kommune mangler", () => {
    const s = lagSted({ navn: "Kafé X", tilsyn: [{ dato: "2025-02-19", karakter: -1 }] });
    expect(stedTittel(s, I_DAG)).toBe("Kafé X – Smilefjes fra Mattilsynet | Smilefjeskartet");
  });
});

describe("stedBeskrivelse", () => {
  it("viser siste smilefjes og temaene med brudd først, så de ordinære tilsynene og det verste", () => {
    const s = lagSted({
      navn: "Kafé X",
      poststed: "Oslo",
      tilsyn: [
        { dato: "2019-04-01", karakter: 0 },
        { dato: "2023-04-01", karakter: 3 },
        { dato: "2023-05-01", karakter: 0, oppfolging: true },
        { dato: "2026-09-14", karakter: 2, temaer: [2, 2, 2, 4] },
      ],
    });
    expect(stedBeskrivelse(s)).toBe(
      "Kafé X i Oslo fikk strekmunn fra Mattilsynet 14. sep. 2026, brudd på rutiner, lokaler og mathåndtering. " +
        "3 ordinære tilsyn siden 2019: 1 smil, 1 strekmunn, 1 sur munn. Verste: sur munn i 2023.",
    );
  });

  it("sier at alle temaer var i orden og nevner ikke verste når alt har vært smil", () => {
    const s = lagSted({
      navn: "Kafé X",
      tilsyn: [
        { dato: "2024-04-01", karakter: 0 },
        { dato: "2025-04-01", karakter: 1, temaer: [1, 0, 0, 5] },
      ],
    });
    expect(stedBeskrivelse(s)).toBe("Kafé X fikk smil fra Mattilsynet 1. apr. 2025, alle temaer i orden. 2 ordinære tilsyn siden 2024: 2 smil.");
  });

  it("bruker entall for ett ordinært tilsyn", () => {
    const s = lagSted({ navn: "Kafé X", tilsyn: [{ dato: "2026-01-05", karakter: 0 }] });
    expect(stedBeskrivelse(s)).toContain("1 ordinært tilsyn siden 2026: 1 smil.");
  });

  it("teller alle tilsyn når ingen ordinære har karakter", () => {
    const s = lagSted({ navn: "Kafé X", tilsyn: [{ dato: "2025-04-01", karakter: -1, temaer: [-1, -1, -1, -1] }] });
    expect(stedBeskrivelse(s)).toBe("Kafé X hadde tilsyn fra Mattilsynet 1. apr. 2025, uten karakter. 1 tilsyn siden 2025.");
  });
});

describe("stedLd", () => {
  it("har bilde, kjøkken og lenke til Brønnøysundregistrene", () => {
    const s = lagSted({ slug: "pizza-x", kategori: "pizza", orgnr: "912345678", tilsyn: [{ dato: "2025-02-19", karakter: 0 }] });
    const ld = stedLd(s);
    expect(ld["@type"]).toBe("FoodEstablishment");
    expect(ld.image).toBe(`https://smilefjeskartet.no/sted/pizza-x/${STED_OG_BILDE}`);
    expect(ld.servesCuisine).toBe("Pizza");
    expect(ld.sameAs).toEqual(["https://virksomhet.brreg.no/oppslag/enheter/912345678"]);
  });

  it("utelater kjøkken og sameAs når kategorien ikke er et kjøkken og orgnr mangler", () => {
    const ld = stedLd(lagSted({ kategori: "kafe", orgnr: null, tilsyn: [{ dato: "2025-02-19", karakter: 0 }] }));
    expect(ld).not.toHaveProperty("servesCuisine");
    expect(ld).not.toHaveProperty("sameAs");
  });
});

describe("STED_OG_BILDE", () => {
  it("er adressen Next.js gir delingsbildet til stedsidene", async () => {
    const { fillStaticMetadataSegment } = await import("next/dist/lib/metadata/get-metadata-route");
    expect(fillStaticMetadataSegment("/(site)/sted/[slug]", "opengraph-image.tsx")).toBe(`/sted/-/${STED_OG_BILDE}.tsx`);
    expect(fs.existsSync(path.join(process.cwd(), "app/(site)/sted/[slug]/opengraph-image.tsx"))).toBe(true);
  });
});

describe("forhandsbygdeSteder", () => {
  it("velger de sist inspiserte stedene", () => {
    const steder = [
      lagSted({ slug: "a", tilsyn: [{ dato: "2026-01-01", karakter: 0 }] }),
      lagSted({ slug: "b", tilsyn: [{ dato: "2026-11-01", karakter: 0 }] }),
      lagSted({ slug: "c", tilsyn: [{ dato: "2026-06-01", karakter: 0 }] }),
    ];
    expect(forhandsbygdeSteder(steder, 2)).toEqual(["b", "c"]);
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

describe("omradeBrodsmulerLd", () => {
  const ld = (type: "kommune" | "fylke" | "kjede", navn: string, url: string, fylke: { navn: string; slug: string } | null = null) =>
    omradeBrodsmulerLd(omradeSmuler(type, navn, fylke), url).itemListElement.map((e) => `${e.position} ${e.name} ${e.item}`);

  it("har ikke /analyse to ganger på fylkessider", () => {
    expect(ld("fylke", "Rogaland", "https://smilefjeskartet.no/fylke/rogaland")).toEqual([
      "1 Analyse https://smilefjeskartet.no/analyse",
      "2 Rogaland https://smilefjeskartet.no/fylke/rogaland",
    ]);
  });

  it("har ikke /analyse to ganger på kjedesider", () => {
    expect(ld("kjede", "Egon", "https://smilefjeskartet.no/kjede/egon")).toEqual([
      "1 Analyse https://smilefjeskartet.no/analyse",
      "2 Egon https://smilefjeskartet.no/kjede/egon",
    ]);
  });

  it("går via fylket på kommunesider", () => {
    expect(ld("kommune", "Stavanger", "https://smilefjeskartet.no/kommune/stavanger", { navn: "Rogaland", slug: "rogaland" })).toEqual([
      "1 Analyse https://smilefjeskartet.no/analyse",
      "2 Rogaland https://smilefjeskartet.no/fylke/rogaland",
      "3 Stavanger https://smilefjeskartet.no/kommune/stavanger",
    ]);
  });

  it("viser Oslo én gang", () => {
    const fylke = { navn: "Oslo", slug: "oslo" };
    expect(omradeSmuler("kommune", "Oslo", fylke).map((s) => s.navn)).toEqual(["Analyse", "Oslo"]);
    expect(ld("kommune", "Oslo", "https://smilefjeskartet.no/kommune/oslo", fylke)).toEqual([
      "1 Analyse https://smilefjeskartet.no/analyse",
      "2 Oslo https://smilefjeskartet.no/kommune/oslo",
    ]);
  });

  it("beholder ankerlenken i de synlige brødsmulene", () => {
    expect(omradeSmuler("fylke", "Rogaland", null)).toEqual([
      { navn: "Analyse", href: "/analyse" },
      { navn: "Fylker", href: "/analyse#fylker" },
      { navn: "Rogaland" },
    ]);
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
    "/sitemap/steder.xml",
    "/prediksjon",
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
    "/prediksjon?fylke=03",
    "/prediksjon?kommune=0301",
    "/prediksjon?fylke=46&kommune=4601",
  ])("stenger %s", (sti) => {
    expect(tillatt(r, sti)).toBe(false);
  });

  it("gjelder alle søkemotorer og peker på sitemapen", () => {
    expect(Array.isArray(r.rules) ? r.rules.length : 1).toBe(1);
    expect(Array.isArray(r.rules) ? r.rules[0].userAgent : r.rules.userAgent).toBe("*");
    expect(r.sitemap).toBe("https://smilefjeskartet.no/sitemap.xml");
  });
});

describe("sitemap", () => {
  const del = (id: string) => sitemap({ id: Promise.resolve(id) });
  const stier = (liste: Awaited<ReturnType<typeof sitemap>>) => liste.map((e) => new URL(e.url).pathname.split("/")[1]);

  it("er delt i core, områder og steder", () => {
    expect(generateSitemaps()).toEqual([{ id: "core" }, { id: "omrader" }, { id: "steder" }]);
  });

  it("legger hver sidetype i sin egen del", async () => {
    const core = await del("core");
    expect(core.map((e) => e.url)).toContain("https://smilefjeskartet.no");
    expect(core.map((e) => e.url)).toContain("https://smilefjeskartet.no/prediksjon");
    expect(stier(core)).not.toContain("sted");

    expect(new Set(stier(await del("omrader")))).toEqual(new Set(["fylke", "kommune", "kjede"]));

    const steder = await del("steder");
    expect(steder.length).toBeGreaterThan(1000);
    expect(new Set(stier(steder))).toEqual(new Set(["sted"]));
  });

  it("gir en tom del for en ukjent id", async () => {
    expect(await del("finnes-ikke")).toEqual([]);
  });

  it("har en indeks som lister alle delene", () => {
    const xml = sitemapIndeks();
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([
      "https://smilefjeskartet.no/sitemap/core.xml",
      "https://smilefjeskartet.no/sitemap/omrader.xml",
      "https://smilefjeskartet.no/sitemap/steder.xml",
    ]);
  });
});
