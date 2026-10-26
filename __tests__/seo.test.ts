import { describe, expect, it } from "vitest";
import { merkeSnippet, stedTittel } from "@/lib/seo";
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
    expect(snippet).toContain(`alt="Smilefjes fra Mattilsynet for Bar &amp; &quot;Grill&quot;"`);
    expect(snippet).toContain(`href="https://smilefjeskartet.no/sted/bar-grill"`);
    expect(snippet).toContain(`src="https://smilefjeskartet.no/sted/bar-grill/merke.png"`);
  });
});
