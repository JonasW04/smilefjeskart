import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "@/next.config";
import { EMBED_HOYDE, embedSnippet, embedUrl } from "@/lib/embed";

describe("embedSnippet", () => {
  it("lager en iframe mot widgeten og en vanlig lenke til kommunesiden", () => {
    const snutt = embedSnippet({ slug: "oslo", navn: "Oslo" });
    expect(snutt).toContain(`<iframe src="https://smilefjeskartet.no/embed/kommune/oslo"`);
    expect(snutt).toContain(`height="${EMBED_HOYDE}"`);
    expect(snutt).toContain(`title="Smilefjes i Oslo – Smilefjeskartet"`);
    expect(snutt).toContain(`loading="lazy"`);
    expect(snutt).toContain(`<a href="https://smilefjeskartet.no/kommune/oslo">Smilefjes i Oslo</a> – data fra Smilefjeskartet.no`);
  });

  it("escaper navn så snutten ikke kan brytes", () => {
    const snutt = embedSnippet({ slug: "heroy-nordland", navn: `Herøy "<b>" & co` });
    expect(snutt).toContain("Herøy &quot;&lt;b&gt;&quot; &amp; co");
    expect(snutt).not.toContain("<b>");
  });

  it("koder slugen i URL-en", () => {
    expect(embedUrl("a b")).toBe("https://smilefjeskartet.no/embed/kommune/a%20b");
  });
});

describe("sikkerhetshoder", () => {
  async function hoder(sti: string): Promise<Record<string, string>> {
    const regler = (await nextConfig.headers!()) ?? [];
    const ut: Record<string, string> = {};
    for (const r of regler) {
      if (getPathMatch(r.source)(sti) === false) continue;
      for (const h of r.headers) ut[h.key] = h.value;
    }
    return ut;
  }

  it("lar /embed/* rammes inn av alle nettsteder", async () => {
    const h = await hoder("/embed/kommune/oslo");
    expect(h["X-Frame-Options"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors *");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("beholder innrammingssperren på resten av nettstedet", async () => {
    for (const sti of ["/", "/kommune/oslo", "/rapport/2026-10", "/embedded", "/sted/embed"]) {
      const h = await hoder(sti);
      expect(h["X-Frame-Options"], sti).toBe("SAMEORIGIN");
      expect(h["Content-Security-Policy"], sti).toContain("frame-ancestors 'self'");
      expect(h["Content-Security-Policy"], sti).not.toContain("frame-ancestors *");
    }
  });
});
