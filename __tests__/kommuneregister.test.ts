import { afterEach, describe, expect, it, vi } from "vitest";
import { lastKommuneregister } from "@/scripts/lib/kommuneregister";

// Stort nok til et landsdekkende register; inkluderer postnummeret som tidligere var beriket.
const register = Array.from({ length: 1200 }, (_, i) =>
  `${String(i + 1).padStart(4, "0")}\tOSLO\t0301\tOSLO\tG`,
).join("\r\n");

function brukSvar(postregister: string | Error, status = 200, kommuneStatus = 200) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("kommuneinfo")) {
      return new Response(JSON.stringify([{ kommunenummer: "0301", kommunenavnNorsk: "Oslo" }]), { status: kommuneStatus });
    }
    if (postregister instanceof Error) throw postregister;
    return new Response(postregister, { status });
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("kommuneregister protects the daily dataset", () => {
  it("rejects a Bring outage instead of returning a resolver that erases municipalities", async () => {
    brukSvar(new Error("network unavailable"));
    await expect(lastKommuneregister(["0162"])).rejects.toThrow(/postnummerregister/);
  });

  it("rejects a non-successful HTTP response", async () => {
    brukSvar("temporarily unavailable", 503);
    await expect(lastKommuneregister(["0162"])).rejects.toThrow(/503/);
  });

  it.each(["", "<html>Maintenance</html>", "0162\tOSLO\t0301\tOSLO\tG"])(
    "rejects empty, malformed or truncated register data: %s",
    async (body) => {
      brukSvar(body);
      await expect(lastKommuneregister()).rejects.toThrow(/postnummerregister/);
    },
  );

  it("rejects a partial register that loses an already mapped postcode", async () => {
    brukSvar(register.replace("0162\tOSLO\t0301\tOSLO\tG\r\n", ""));
    await expect(lastKommuneregister(["0162"])).rejects.toThrow(/0162/);
  });

  it("uses Bring names when the optional Kartverket name service is down", async () => {
    brukSvar(register, 200, 503);
    const oppslag = await lastKommuneregister(["0162"]);
    expect(oppslag("0162")).toEqual({ nr: "0301", navn: "Oslo" });
    expect(oppslag("9999")).toBeNull();
  });
});
