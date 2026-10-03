import { describe, expect, it } from "vitest";
import { kategoriForSted, kategoriFraNavn, kjedeFraNavn } from "@/lib/classify";
import { fylkeFraKommunenr, haversineKm } from "@/lib/geo";
import { isGraded, smileFromKarakter, totalKarakter } from "@/lib/smile";
import { asciiFold, escapeHtml, foldForSearch, slugify, titleCase } from "@/lib/text";

describe("smile", () => {
  it("maps karakter to smilefjes", () => {
    expect(smileFromKarakter(0)).toBe("smil");
    expect(smileFromKarakter(1)).toBe("smil");
    expect(smileFromKarakter(2)).toBe("strek");
    expect(smileFromKarakter(3)).toBe("sur");
    expect(smileFromKarakter(4)).toBeNull();
    expect(smileFromKarakter(-1)).toBeNull();
  });

  it("only treats 0–3 as graded", () => {
    expect([0, 1, 2, 3].every(isGraded)).toBe(true);
    expect([4, 5, -1, 1.5].some(isGraded)).toBe(false);
  });

  it("prefers official total and falls back to worst tema", () => {
    expect(totalKarakter(0, [1, 0, 0, 0])).toBe(0);
    expect(totalKarakter(-1, [0, 2, 4, 5])).toBe(2);
    expect(totalKarakter(-1, [4, 5, -1, -1])).toBe(-1);
  });
});

describe("text", () => {
  it("slugifies Norwegian names", () => {
    expect(slugify("Bølgen & Moi, Bærum")).toBe("bolgen-moi-baerum");
    expect(slugify("Café Åsgårdstrand")).toBe("cafe-asgardstrand");
    expect(slugify("McDonald’s")).toBe("mcdonald-s");
    expect(slugify("  ")).toBe("");
  });

  it("folds for search but keeps æøå", () => {
    expect(foldForSearch("Café Bølgen’s")).toBe("cafe bølgens");
    expect(foldForSearch("Åsgårdstrand")).toBe("åsgårdstrand");
    expect(asciiFold("Bølgen & Moi")).toBe("bolgen moi");
  });

  it("title-cases kommune names", () => {
    expect(titleCase("NORD-FRON")).toBe("Nord-Fron");
    expect(titleCase("ØVRE EIKER")).toBe("Øvre Eiker");
    expect(titleCase("MO I RANA")).toBe("Mo i Rana");
    expect(titleCase("I DUN")).toBe("I Dun");
    expect(titleCase("Mo i Rana")).toBe("Mo i Rana");
  });
});

describe("classify", () => {
  it("detects chains", () => {
    expect(kjedeFraNavn("Burger King Storo")?.navn).toBe("Burger King");
    expect(kjedeFraNavn("McDonald’s Familierestaurant, Lillestrøm")?.navn).toBe("McDonald’s");
    expect(kjedeFraNavn("Godt Brød Grünerløkka")?.slug).toBe("godt-brod");
    expect(kjedeFraNavn("Espresso Bar Lokal")).toBeNull();
    expect(kjedeFraNavn("Bislett Kebab House Majorstuen")?.navn).toBe("Bislett Kebab");
  });

  it("guesses category from name", () => {
    expect(kategoriFraNavn("Pizzeria Da Mario")).toBe("pizza");
    expect(kategoriFraNavn("Sushi & Pizza Kafé")).toBe("sushi");
    expect(kategoriFraNavn("Thai Orchid")).toBe("asiatisk");
    expect(kategoriFraNavn("Kjelstad Bakeri")).toBe("bakeri");
    expect(kategoriFraNavn("Restaurant Fjord")).toBe("annet");
  });

  it("lets chain category win", () => {
    expect(kategoriForSted("Burger King Bar & Grill", kjedeFraNavn("Burger King"))).toBe("burger");
  });
});

describe("geo", () => {
  it("derives fylke from kommunenummer", () => {
    expect(fylkeFraKommunenr("0301")).toEqual({ nr: "03", navn: "Oslo" });
    expect(fylkeFraKommunenr("4601")?.navn).toBe("Vestland");
    expect(fylkeFraKommunenr("9999")).toBeNull();
    expect(fylkeFraKommunenr(null)).toBeNull();
  });

  it("computes distance", () => {
    // Oslo S → Bergen stasjon ≈ 305 km
    expect(haversineKm(59.911, 10.753, 60.39, 5.333)).toBeGreaterThan(300);
    expect(haversineKm(59.911, 10.753, 60.39, 5.333)).toBeLessThan(310);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml("Bølgen & Moi")).toBe("Bølgen &amp; Moi");
  });
});
