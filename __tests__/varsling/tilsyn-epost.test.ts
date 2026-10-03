import { describe, expect, it } from "vitest";
import { avmeldHeaders, bekreftelsesEpost, sammendragEmne, sammendragEpost } from "@/lib/varsling/epost";
import { beskrivOmrade, estimat, sokelister } from "@/lib/varsling/omrade";
import { ferskeTilsyn, nyeTilsyn, tilsynNokkel, treffFor, vinduStart } from "@/lib/varsling/tilsyn";
import type { Abonnement } from "@/lib/varsling/typer";
import { sted, tilsyn } from "./fakes";

const oslo = sted({ id: "A", navn: "Oslo-kafeen", tilsyn: [tilsyn("2020-01-01", 0), tilsyn("2026-09-20", 2), tilsyn("2026-09-25", 0, true)] });
const bergen = sted({
  id: "B",
  navn: "Bryggen Bistro",
  kommunenr: "4601",
  kommune: "Bergen",
  poststed: "Bergen",
  lat: 60.397,
  lng: 5.324,
  tilsyn: [tilsyn("2026-09-30", 3)],
});
const utenKoord = sted({ id: "C", lat: null, lng: null, tilsyn: [tilsyn("2026-09-29", 3), tilsyn("2026-09-28", -1)] });
const steder = [oslo, bergen, utenKoord];

describe("nye tilsyn", () => {
  it("finner tilsyn i vinduet, uten ukjente karakterer og fremtidige datoer", () => {
    expect(vinduStart("2026-10-03")).toBe("2026-08-04");
    const ferske = ferskeTilsyn(steder, "2026-09-01", "2026-09-29");
    expect(ferske.map((t) => t.key).sort()).toEqual(["A|2026-09-20|2", "A|2026-09-25|0", "C|2026-09-29|3"]);
  });

  it("trekker fra det som er sett før – også tilsyn som dukker opp sent", () => {
    const sett = new Set(["A|2026-09-20|2", "A|2026-09-25|0"]);
    const nye = nyeTilsyn(ferskeTilsyn(steder, "2026-09-01"), sett);
    expect(nye.map((t) => t.key).sort()).toEqual(["B|2026-09-30|3", "C|2026-09-29|3"]);
    // Et tilsyn datert 20. september som dukker opp i datasettet først nå, er fortsatt nytt.
    const sent = sted({ ...oslo, tilsyn: [...oslo.tilsyn, tilsyn("2026-09-21", 3)] });
    expect(nyeTilsyn(ferskeTilsyn([sent], "2026-09-01"), sett).map((t) => t.key)).toEqual([tilsynNokkel("A", tilsyn("2026-09-21", 3))]);
  });
});

describe("matching", () => {
  const nye = ferskeTilsyn(steder, "2026-09-01");

  it("matcher på radius og filtre, verst først", () => {
    const abo = { omrade: { type: "radius" as const, lat: 59.92, lng: 10.76, km: 2 as const }, filtre: ["smil", "strek", "sur"] as const };
    expect(treffFor({ ...abo, filtre: [...abo.filtre] }, nye).map((t) => t.key)).toEqual(["A|2026-09-20|2", "A|2026-09-25|0"]);
    expect(treffFor({ ...abo, filtre: ["sur"] }, nye)).toEqual([]);
  });

  it("matcher på kommune, også steder uten koordinater", () => {
    const t = treffFor({ omrade: { type: "kommuner", kommuner: ["0301", "4601"] }, filtre: ["sur"] }, nye);
    expect(t.map((x) => x.key)).toEqual(["B|2026-09-30|3", "C|2026-09-29|3"]);
  });

  it("beskriver og estimerer områder", () => {
    expect(beskrivOmrade({ type: "kommuner", kommuner: ["0301", "4601"] }, steder)).toBe("Oslo og Bergen");
    expect(beskrivOmrade({ type: "radius", lat: 60.39, lng: 5.32, km: 5 }, steder)).toBe("5 km rundt et punkt i Bergen");
    const e = estimat({ type: "kommuner", kommuner: ["0301"] }, ["strek", "sur"], steder, "2026-10-03");
    expect(e).toEqual({ steder: 2, siste12: { smil: 1, strek: 1, sur: 1 }, dagerMedTreff: 2 });
    const l = sokelister(steder);
    expect(l.kommuner.map((k) => k[1])).toEqual(["Bergen", "Oslo"]);
  });
});

describe("e-post", () => {
  const ond = sted({
    id: "X",
    slug: "ond-kafe",
    navn: `<script>alert("hei")</script> & 'Co'`,
    adresse: `<img src=x onerror=alert(1)>`,
    poststed: "Oslo\r\nBcc: offer@example.com",
    tilsyn: [tilsyn("2026-09-30", 3)],
  });
  const abo: Pick<Abonnement, "omrade" | "omradeTekst" | "filtre"> = {
    omrade: { type: "kommuner", kommuner: ["0301"] },
    omradeTekst: "Oslo",
    filtre: ["strek", "sur"],
  };
  const avmeldUrl = "https://smilefjeskartet.no/api/varsling/avmeld?token=abc.def";

  it("escaper all data i HTML-en", () => {
    const e = sammendragEpost({ abo, treff: ferskeTilsyn([ond, bergen], "2026-09-01"), siteUrl: "https://smilefjeskartet.no", avmeldUrl });
    expect(e.html).not.toContain("<script>");
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;script&gt;alert(&quot;hei&quot;)&lt;/script&gt; &amp; &#39;Co&#39;");
    expect(e.html).toContain('href="https://smilefjeskartet.no/sted/ond-kafe"');
    expect(e.html).toContain('src="https://smilefjeskartet.no/epost/sur.png"');
    expect(e.html).toContain(avmeldUrl);
    expect(e.tekst).toContain(avmeldUrl);
    expect(e.tekst).toContain("https://smilefjeskartet.no/sted/ond-kafe");
    expect(e.emne).toBe("2 nye smilefjes i Oslo: 2 sure munner");
  });

  it("lager emner uten linjeskift", () => {
    const [t] = ferskeTilsyn([sted({ ...ond, navn: "Kafé\r\nBcc: x@y.no" })], "2026-09-01");
    const emne = sammendragEmne([t], abo);
    expect(emne).toBe("😠 Sur munn for Kafé Bcc: x@y.no");
    expect(emne).not.toMatch(/[\r\n]/);
  });

  it("viser maks 25 treff og sier hvor mange flere det er", () => {
    const mange = Array.from({ length: 30 }, (_, i) => sted({ id: `M${i}`, tilsyn: [tilsyn("2026-09-30", 2)] }));
    const e = sammendragEpost({ abo, treff: ferskeTilsyn(mange, "2026-09-01"), siteUrl: "https://s.no", avmeldUrl });
    expect(e.html).toContain("…og 5 til");
    expect((e.html.match(/\/sted\//g) ?? []).length).toBe(25);
  });

  it("bekreftelsen har lenken og forklarer hva som skjer", () => {
    const url = "https://smilefjeskartet.no/api/varsling/bekreft?token=a.b";
    const e = bekreftelsesEpost({ abo, bekreftUrl: url, siteUrl: "https://smilefjeskartet.no" });
    expect(e.html).toContain(`href="${url}"`);
    expect(e.tekst).toContain(url);
    expect(e.tekst).toContain("strekmunn og sur munn i Oslo");
  });

  it("har ett-klikks avmelding etter RFC 8058", () => {
    expect(avmeldHeaders(avmeldUrl)).toEqual({
      "List-Unsubscribe": `<${avmeldUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
