import { describe, expect, it } from "vitest";
import { filtrerAnalyseHendelse } from "@/lib/analytics";

describe("varsling og nettstedsanalyse", () => {
  it("sender ikke tokens i sidevisninger eller egendefinerte hendelser", () => {
    for (const type of ["pageview", "event"] as const) {
      for (const url of ["https://smilefjeskartet.no/varsling/avmeldt?status=bekreft&token=hemmelig", "/varsling/avmeldt?%74oken=hemmelig"]) {
        expect(filtrerAnalyseHendelse({ type, url })).toBeNull();
      }
    }
  });

  it("beholder vanlige kart- og analysevisninger", () => {
    const event = { type: "pageview" as const, url: "https://smilefjeskartet.no/?sted=burgerbua" };
    expect(filtrerAnalyseHendelse(event)).toBe(event);
  });
});
