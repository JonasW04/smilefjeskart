/**
 * Hele flyten gjennom de ekte route-handlerne, med fetch byttet ut: Upstash REST-kall går til en
 * MinneKv, og Resend-kall fanges opp. Tester dermed også formatet på forespørslene våre.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOKLER } from "@/lib/varsling/store";
import { MinneKv } from "./fakes";

const ENV = {
  UPSTASH_REDIS_REST_URL: "https://falsk.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "hemmelig-token",
  RESEND_API_KEY: "re_falsk",
  VARSLING_SECRET: "rute-test-hemmelighet-som-er-lang-nok-123456",
  VARSLING_FRA: "Smilefjeskartet <varsel@smilefjeskartet.no>",
  NEXT_PUBLIC_SITE_URL: "https://smilefjeskartet.no",
};

let kv: MinneKv;
let eposter: Array<{ headers: Record<string, string>; body: Record<string, unknown> }>;

beforeEach(() => {
  kv = new MinneKv();
  eposter = [];
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = init.headers as Record<string, string>;
    const body = JSON.parse(String(init.body));
    if (url.startsWith(ENV.UPSTASH_REDIS_REST_URL)) {
      expect(headers.Authorization).toBe(`Bearer ${ENV.UPSTASH_REDIS_REST_TOKEN}`);
      if (url.endsWith("/pipeline")) {
        return Response.json(await Promise.all((body as unknown[][]).map(async (c) => ({ result: await kv.cmd(...(c as string[])) }))));
      }
      return Response.json({ result: await kv.cmd(...(body as string[])) });
    }
    if (url === "https://api.resend.com/emails") {
      expect(headers.Authorization).toBe(`Bearer ${ENV.RESEND_API_KEY}`);
      eposter.push({ headers, body });
      return Response.json({ id: `e${eposter.length}` });
    }
    throw new Error(`Uventet fetch til ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function abonner(body: unknown, headers: Record<string, string> = {}) {
  return import("@/app/api/varsling/abonner/route").then(({ POST }) =>
    POST(
      new Request("https://smilefjeskartet.no/api/varsling/abonner", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://smilefjeskartet.no", "x-forwarded-for": "10.0.0.1, 1.1.1.1", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    ),
  );
}

const gyldig = { epost: "Test@Example.no", omrade: { type: "kommuner", kommuner: ["0301"] }, filtre: ["sur"], nettside: "" };

describe("API-flyten", () => {
  it("påmelding → bekreftelse → avmelding", async () => {
    const res = await abonner(gyldig);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(eposter).toHaveLength(1);
    const e = eposter[0];
    expect(e.body).toMatchObject({ from: ENV.VARSLING_FRA, to: ["test@example.no"], subject: expect.stringContaining("Bekreft") });
    expect(e.headers["Idempotency-Key"]).toMatch(/^bekreft-/);

    const lenke = String(e.body.text).match(/https:\/\/smilefjeskartet\.no\/api\/varsling\/bekreft\?token=\S+/)![0];
    const { GET: bekreft } = await import("@/app/api/varsling/bekreft/route");
    const r1 = await bekreft(new NextRequest(lenke));
    expect(r1.status).toBe(303);
    expect(r1.headers.get("location")).toBe("https://smilefjeskartet.no/varsling/bekreftet?status=ok");
    expect(await kv.cmd("SCARD", NOKLER.aktive)).toBe(1);

    // Avmelding via RFC 8058 POST med token for dette abonnementet.
    const [id] = (await kv.cmd<string[]>("SMEMBERS", NOKLER.aktive))!;
    const { lagToken } = await import("@/lib/varsling/token");
    const token = lagToken(ENV.VARSLING_SECRET, { f: "avmeld", id });
    const { POST: avmeldPost, GET: avmeldGet } = await import("@/app/api/varsling/avmeld/route");
    const r2 = await avmeldPost(new NextRequest(`https://smilefjeskartet.no/api/varsling/avmeld?token=${encodeURIComponent(token)}`, { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(r2.status).toBe(200);
    expect(await kv.cmd("SCARD", NOKLER.aktive)).toBe(0);
    expect(await kv.cmd("GET", NOKLER.abo(id))).toBeNull();
    // Idempotent, også via GET.
    const r3 = await avmeldGet(new NextRequest(`https://smilefjeskartet.no/api/varsling/avmeld?token=${encodeURIComponent(token)}`));
    expect(r3.headers.get("location")).toBe("https://smilefjeskartet.no/varsling/avmeldt?status=ok");
  });

  it("omdirigerer ugyldige og forfalskede tokens til en fast side", async () => {
    const { GET: bekreft } = await import("@/app/api/varsling/bekreft/route");
    const { GET: avmeld } = await import("@/app/api/varsling/avmeld/route");
    for (const t of ["", "x.y", "https://evil.example/"]) {
      const r = await bekreft(new NextRequest(`https://smilefjeskartet.no/api/varsling/bekreft?token=${encodeURIComponent(t)}`));
      expect(r.headers.get("location")).toBe("https://smilefjeskartet.no/varsling/bekreftet?status=ugyldig");
    }
    const r = await avmeld(new NextRequest("https://smilefjeskartet.no/api/varsling/avmeld?token=x.y"));
    expect(r.headers.get("location")).toBe("https://smilefjeskartet.no/varsling/avmeldt?status=ugyldig");
  });

  it("avviser fremmede opphav, feil innholdstype, store og ugyldige forespørsler", async () => {
    expect((await abonner(gyldig, { origin: "https://evil.example" })).status).toBe(403);
    expect((await abonner(gyldig, { "content-type": "text/plain" })).status).toBe(415);
    expect((await abonner("{ikke json")).status).toBe(400);
    expect((await abonner({ ...gyldig, ekstra: "x".repeat(5000) })).status).toBe(413);
    const ugyldig = await abonner({ ...gyldig, omrade: { type: "kommuner", kommuner: ["9999"] } });
    expect(ugyldig.status).toBe(400);
    expect(await ugyldig.json()).toMatchObject({ ok: false, feil: { omrade: "Ukjent kommune." } });
    expect(eposter).toHaveLength(0);
  });

  it("lekker ikke om en adresse allerede abonnerer", async () => {
    const a = await (await abonner(gyldig)).json();
    const b = await (await abonner(gyldig)).json();
    const c = await (await abonner({ ...gyldig, epost: "annen@example.no" })).json();
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
