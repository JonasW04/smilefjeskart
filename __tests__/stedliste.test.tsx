import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AlleSteder from "@/components/analyse/AlleSteder";
import { FORSTE_RADER, filtrerSteder, stedRad, type StedTuppel } from "@/lib/stedliste";

const steder: StedTuppel[] = [
  ["cafe-bolgen", "Café Bølgen", "smil", "Strandgata 1", "3/3"],
  ["kebab-hjornet", "Kebabhjørnet", "sur", "Torget 2", "1/4"],
  ["nytt-sted", "Nytt sted", "ukjent", "Strandgata 9", "–"],
];

describe("place list for large area pages", () => {
  it("matches every word against name and address, ignoring case and accents but keeping æøå", () => {
    expect(filtrerSteder(steder, "cafe").map((s) => s[0])).toEqual(["cafe-bolgen"]);
    expect(filtrerSteder(steder, "BØLGEN strand").map((s) => s[0])).toEqual(["cafe-bolgen"]);
    expect(filtrerSteder(steder, "strandgata").map((s) => s[0])).toEqual(["cafe-bolgen", "nytt-sted"]);
    expect(filtrerSteder(steder, "bolgen")).toEqual([]);
    expect(filtrerSteder(steder, "  ")).toBe(steder);
  });

  it("labels faces for screen readers, including places without a grade", () => {
    expect(stedRad(steder[1])).toMatchObject({ slug: "kebab-hjornet", kind: "sur", label: "Sur munn", meta: "1/4" });
    expect(stedRad(steder[2]).label).toBe("Ukjent");
  });

  it("server-renders only the first rows, as plain links, with a way to load the rest", () => {
    const mange: StedTuppel[] = Array.from({ length: 500 }, (_, i) => [`sted-${i}`, `Sted ${i}`, "smil", "Gate 1", "1/1"]);
    const html = renderToStaticMarkup(<AlleSteder forste={mange.slice(0, FORSTE_RADER)} totalt={mange.length} kilde="/kommune/x/steder.json" />);
    expect(html.match(/href="\/sted\//g)).toHaveLength(FORSTE_RADER);
    expect(html).toContain(`href="/sted/sted-${FORSTE_RADER - 1}"`);
    expect(html).not.toContain(`href="/sted/sted-${FORSTE_RADER}"`);
    expect(html).toContain(`Vis flere (${500 - FORSTE_RADER} igjen)`);
    expect(html).toContain("Søk blant 500 steder");
  });
});
