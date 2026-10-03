import { describe, expect, it } from "vitest";
import {
  buildSteder,
  isoFromDdmmyyyy,
  parseCsv,
  parseKarakter,
  shortHash,
  toKartData,
  type BuildOptions,
} from "@/scripts/lib/pipeline";
import { KART } from "@/lib/types";

const HEADER =
  "tilsynsobjektid;orgnummer;navn;adrlinje1;adrlinje2;postnr;poststed;tilsynid;sakref;status;dato;total_karakter;tilsynsbesoektype;tema1_no;tema1_nn;karakter1;tema2_no;tema2_nn;karakter2;tema3_no;tema3_nn;karakter3;tema4_no;tema4_nn;karakter4";

function row(id: string, navn: string, dato: string, total: string, k: string[], opts: Partial<{ postnr: string; poststed: string; type: string; orgnr: string }> = {}) {
  const t = ["Rutiner og ledelse", "Lokaler og utstyr", "Mathåndtering og tilberedning", "Merking og sporbarhet"];
  return [
    id,
    opts.orgnr ?? "973870718",
    navn,
    "Karl Johans gate 37",
    "",
    opts.postnr ?? "0162",
    opts.poststed ?? "OSLO",
    `T${id}${dato}`,
    "2016/1",
    "0",
    dato,
    total,
    opts.type ?? "0",
    t[0], t[0], k[0],
    t[1], t[1], k[1],
    t[2], t[2], k[2],
    t[3], t[3], k[3],
  ].join(";");
}

const CSV = [
  "﻿" + HEADER,
  row("A", "Egon Gammelnavn", "05012016", "1", ["0", "1", "0", "0"]),
  row("A", "Egon Karl Johan", "14012026", "0", ["0", "0", "0", "0"]),
  row("A", "Egon Karl Johan", "03062025", "2", ["0", "2", "0", "0"]),
  row("A", "Egon Karl Johan", "03062025", "2", ["0", "2", "0", "0"]), // eksakt duplikat
  row("B", "Pizza Palace", "01022020", "", ["0", "3", "4", "5"], { postnr: "", poststed: "" }),
  row("C", "Pizza Palace", "01022019", "0", ["0", "0", "0", "0"], { postnr: "5003", poststed: "BERGEN" }),
  row("D", "Pizza Palace", "01022018", "0", ["0", "0", "0", "0"], { postnr: "5003", poststed: "BERGEN", orgnr: "123" }),
  "X;;;;;;;;;;baddato;0;0;;;0;;;0;;;0;;;0",
].join("\n");

const opts: BuildOptions = {
  kommuneForPostnr: (p) => (p === "0162" ? { nr: "0301", navn: "Oslo" } : p === "5003" ? { nr: "4601", navn: "Bergen" } : null),
  koordinatFor: (r) => (r.postnr ? { lng: 10.7379084687, lat: 59.914197039 } : null),
};

describe("pipeline helpers", () => {
  it("parses dates and karakterer", () => {
    expect(isoFromDdmmyyyy("05012016")).toBe("2016-01-05");
    expect(parseKarakter("3")).toBe(3);
    expect(parseKarakter("")).toBe(-1);
    expect(parseKarakter(undefined)).toBe(-1);
    expect(parseKarakter("x")).toBe(-1);
  });

  it("hashes stably", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
  });

  it("drops rows without valid date or name", () => {
    expect(parseCsv(CSV)).toHaveLength(7);
  });
});

describe("buildSteder", () => {
  const steder = buildSteder(parseCsv(CSV), opts);
  const bySlug = Object.fromEntries(steder.map((s) => [s.slug, s]));

  it("groups history per place, sorted and deduplicated", () => {
    const a = steder.find((s) => s.id === "A")!;
    expect(a.tilsyn.map((t) => t.dato)).toEqual(["2016-01-05", "2025-06-03", "2026-01-14"]);
    expect(a.tilsyn.map((t) => t.karakter)).toEqual([1, 2, 0]);
  });

  it("uses the newest name and enriches with kommune, fylke, chain", () => {
    const a = steder.find((s) => s.id === "A")!;
    expect(a.navn).toBe("Egon Karl Johan");
    expect(a.poststed).toBe("Oslo");
    expect(a.kommune).toBe("Oslo");
    expect(a.fylke).toBe("Oslo");
    expect(a.kjede).toBe("Egon");
    expect(a.orgnr).toBe("973870718");
    expect(a.lng).toBe(10.737908);
  });

  it("falls back to worst tema when total is missing, ignoring 4/5", () => {
    const b = steder.find((s) => s.id === "B")!;
    expect(b.tilsyn[0].karakter).toBe(3);
    expect(b.postnr).toBe("");
    expect(b.kommune).toBeNull();
    expect(b.lng).toBeNull();
  });

  it("assigns unique, stable slugs with oldest place keeping the clean slug", () => {
    expect(bySlug["egon-karl-johan-oslo"]?.id).toBe("A");
    expect(bySlug["pizza-palace"]?.id).toBe("B");
    expect(bySlug["pizza-palace-bergen"]?.id).toBe("D");
    expect(bySlug[`pizza-palace-bergen-${shortHash("C")}`]?.id).toBe("C");
    expect(steder.find((s) => s.id === "D")!.orgnr).toBeNull();
  });

  it("builds compact map rows only for places with coordinates", () => {
    const kart = toKartData(steder, ["annet", "pizza"], "2026-10-04T00:00:00Z");
    expect(kart.steder).toHaveLength(3);
    const a = kart.steder.find((r) => r[KART.SLUG] === "egon-karl-johan-oslo")!;
    expect(a[KART.KARAKTER]).toBe(0);
    expect(a[KART.DATO]).toBe(20260114);
    expect(a[KART.ANTALL]).toBe(3);
    expect(a[KART.VERSTE]).toBe(2);
    expect(a[KART.VERSTE_3AAR]).toBe(2); // strekmunn i 2025 er innenfor 3 år
    const d = kart.steder.find((r) => r[KART.SLUG] === "pizza-palace-bergen")!;
    expect(d[KART.VERSTE_3AAR]).toBe(0); // ingen tilsyn siste 3 år → siste karakter
    expect(kart.kommuner[a[KART.KOMMUNE]]).toEqual(["0301", "Oslo", "Oslo"]);
    const c = kart.steder.find((r) => r[KART.SLUG] === "pizza-palace-bergen")!;
    expect(kart.kategorier[c[KART.KATEGORI]]).toBe("pizza");
  });
});
