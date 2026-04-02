import { describe, it, expect } from "vitest";
import {
  formatDato,
  parseDatoToDate,
  toNumberMaybe,
  computeSmileScore,
  karakterLabel,
  smileEmoji,
  smileGroupFromScore,
  normalizeSearch,
  isValidEmail,
  isValidLatitude,
  isValidLongitude,
  toLngLatTuple,
  haversineKm,
  type TilsynProperties,
} from "../app/lib/utils";

// ---------------------------------------------------------------------------
// formatDato
// ---------------------------------------------------------------------------
describe("formatDato", () => {
  it("formats ddmmyyyy to dd.mm.yyyy", () => {
    expect(formatDato("01042026")).toBe("01.04.2026");
    expect(formatDato("31122025")).toBe("31.12.2025");
  });

  it("returns input unchanged for invalid lengths", () => {
    expect(formatDato("123")).toBe("123");
    expect(formatDato("")).toBe("");
    expect(formatDato("123456789")).toBe("123456789");
  });

  it("handles whitespace", () => {
    expect(formatDato(" 01042026 ")).toBe("01.04.2026");
  });
});

// ---------------------------------------------------------------------------
// parseDatoToDate
// ---------------------------------------------------------------------------
describe("parseDatoToDate", () => {
  it("parses valid ddmmyyyy strings", () => {
    const d = parseDatoToDate("01042026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3); // April = 3
    expect(d!.getDate()).toBe(1);
  });

  it("returns null for invalid strings", () => {
    expect(parseDatoToDate("")).toBeNull();
    expect(parseDatoToDate("abc")).toBeNull();
    expect(parseDatoToDate("123")).toBeNull();
  });

  it("handles whitespace", () => {
    const d = parseDatoToDate(" 15062025 ");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// toNumberMaybe
// ---------------------------------------------------------------------------
describe("toNumberMaybe", () => {
  it("returns numbers as-is", () => {
    expect(toNumberMaybe(42)).toBe(42);
    expect(toNumberMaybe(0)).toBe(0);
    expect(toNumberMaybe(-3.14)).toBe(-3.14);
  });

  it("returns null for non-finite numbers", () => {
    expect(toNumberMaybe(NaN)).toBeNull();
    expect(toNumberMaybe(Infinity)).toBeNull();
    expect(toNumberMaybe(-Infinity)).toBeNull();
  });

  it("parses strings to numbers", () => {
    expect(toNumberMaybe("42")).toBe(42);
    expect(toNumberMaybe(" 3.14 ")).toBe(3.14);
    expect(toNumberMaybe("0")).toBe(0);
  });

  it("returns null for non-numeric strings", () => {
    expect(toNumberMaybe("abc")).toBeNull();
    expect(toNumberMaybe("")).toBeNull();
    expect(toNumberMaybe("  ")).toBeNull();
  });

  it("returns null for other types", () => {
    expect(toNumberMaybe(null)).toBeNull();
    expect(toNumberMaybe(undefined)).toBeNull();
    expect(toNumberMaybe({})).toBeNull();
    expect(toNumberMaybe([])).toBeNull();
    expect(toNumberMaybe(true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeSmileScore
// ---------------------------------------------------------------------------
describe("computeSmileScore", () => {
  const base: TilsynProperties = {
    tilsynsobjektid: "test",
    orgnummer: null,
    navn: "Test",
    adresse: "Test 1",
    dato: "01012025",
    status: null,
  };

  it("returns max of karakter1-4 when present", () => {
    expect(computeSmileScore({ ...base, karakter1: 0, karakter2: 1, karakter3: 0, karakter4: 0 })).toBe(1);
    expect(computeSmileScore({ ...base, karakter1: 2, karakter2: 3, karakter3: 1, karakter4: 0 })).toBe(3);
  });

  it("ignores values 4 and 5 (not applicable / not evaluated)", () => {
    expect(computeSmileScore({ ...base, karakter1: 4, karakter2: 5, karakter3: 1 })).toBe(1);
    expect(computeSmileScore({ ...base, karakter1: 4, karakter2: 5 })).toBe(-1);
  });

  it("falls back to karakter if no category scores", () => {
    expect(computeSmileScore({ ...base, karakter: 2 })).toBe(2);
    expect(computeSmileScore({ ...base, karakter: 0 })).toBe(0);
  });

  it("returns -1 when no valid score exists", () => {
    expect(computeSmileScore(base)).toBe(-1);
    expect(computeSmileScore({ ...base, karakter: -1 })).toBe(-1);
    expect(computeSmileScore({ ...base, karakter: 99 })).toBe(-1);
  });

  it("handles string karakter values", () => {
    expect(computeSmileScore({ ...base, karakter1: "2", karakter2: "0" })).toBe(2);
    expect(computeSmileScore({ ...base, karakter1: "abc" })).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// karakterLabel
// ---------------------------------------------------------------------------
describe("karakterLabel", () => {
  it("returns correct labels for known values", () => {
    expect(karakterLabel(0)).toContain("Ingen brudd");
    expect(karakterLabel(1)).toContain("Mindre brudd");
    expect(karakterLabel(2)).toContain("Strekmunn");
    expect(karakterLabel(3)).toContain("Sur munn");
    expect(karakterLabel(4)).toContain("Ikke aktuelt");
    expect(karakterLabel(5)).toContain("Ikke vurdert");
  });

  it("returns ukjent for unknown values", () => {
    expect(karakterLabel(-1)).toBe("Ukjent karakter.");
    expect(karakterLabel(99)).toBe("Ukjent karakter.");
  });
});

// ---------------------------------------------------------------------------
// smileEmoji
// ---------------------------------------------------------------------------
describe("smileEmoji", () => {
  it("returns smile for 0 and 1", () => {
    expect(smileEmoji(0)).toBe("😊");
    expect(smileEmoji(1)).toBe("😊");
  });

  it("returns neutral for 2", () => {
    expect(smileEmoji(2)).toBe("😐");
  });

  it("returns frown for 3", () => {
    expect(smileEmoji(3)).toBe("😠");
  });

  it("returns question mark for unknown", () => {
    expect(smileEmoji(-1)).toBe("❓");
    expect(smileEmoji(99)).toBe("❓");
  });
});

// ---------------------------------------------------------------------------
// smileGroupFromScore
// ---------------------------------------------------------------------------
describe("smileGroupFromScore", () => {
  it("maps scores to groups", () => {
    expect(smileGroupFromScore(0)).toBe("smil");
    expect(smileGroupFromScore(1)).toBe("smil");
    expect(smileGroupFromScore(2)).toBe("strek");
    expect(smileGroupFromScore(3)).toBe("sur");
  });

  it("returns null for unknown scores", () => {
    expect(smileGroupFromScore(-1)).toBeNull();
    expect(smileGroupFromScore(99)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeSearch
// ---------------------------------------------------------------------------
describe("normalizeSearch", () => {
  it("lowercases and trims", () => {
    expect(normalizeSearch("  Hello World  ")).toBe("hello world");
  });

  it("collapses multiple whitespace", () => {
    expect(normalizeSearch("foo   bar  baz")).toBe("foo bar baz");
  });

  it("handles empty string", () => {
    expect(normalizeSearch("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// isValidEmail
// ---------------------------------------------------------------------------
describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("test@example.com")).toBe(true);
    expect(isValidEmail("a@b")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("@")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidLatitude / isValidLongitude
// ---------------------------------------------------------------------------
describe("isValidLatitude", () => {
  it("accepts valid latitudes", () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(59.9)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
  });

  it("rejects invalid latitudes", () => {
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLatitude(Infinity)).toBe(false);
  });
});

describe("isValidLongitude", () => {
  it("accepts valid longitudes", () => {
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(10.7)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
  });

  it("rejects invalid longitudes", () => {
    expect(isValidLongitude(181)).toBe(false);
    expect(isValidLongitude(-181)).toBe(false);
    expect(isValidLongitude(NaN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toLngLatTuple
// ---------------------------------------------------------------------------
describe("toLngLatTuple", () => {
  it("converts valid position arrays", () => {
    expect(toLngLatTuple([10.7, 59.9])).toEqual([10.7, 59.9]);
    expect(toLngLatTuple([0, 0, 100])).toEqual([0, 0]);
  });

  it("returns null for invalid inputs", () => {
    expect(toLngLatTuple([])).toBeNull();
    expect(toLngLatTuple([1])).toBeNull();
    expect(toLngLatTuple(["a", "b"] as unknown as number[])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// haversineKm
// ---------------------------------------------------------------------------
describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(haversineKm(59.9, 10.7, 59.9, 10.7)).toBe(0);
  });

  it("computes approximate distance between Oslo and Bergen", () => {
    // Oslo (59.91, 10.75) to Bergen (60.39, 5.32) ≈ 305 km
    const dist = haversineKm(59.91, 10.75, 60.39, 5.32);
    expect(dist).toBeGreaterThan(290);
    expect(dist).toBeLessThan(320);
  });

  it("computes approximate distance between nearby points", () => {
    // ~1km apart
    const dist = haversineKm(59.9, 10.7, 59.909, 10.7);
    expect(dist).toBeGreaterThan(0.9);
    expect(dist).toBeLessThan(1.1);
  });
});
