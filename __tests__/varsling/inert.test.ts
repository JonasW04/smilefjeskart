/** Uten miljøvariabler skal alt være av, men oppføre seg pent. */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lesVarslingConfig, PAAKREVDE_ENV, varslingAktiv } from "@/lib/varsling/config";

const FULL = {
  UPSTASH_REDIS_REST_URL: "https://eu1-noe.upstash.io/",
  UPSTASH_REDIS_REST_TOKEN: "tok",
  RESEND_API_KEY: "re_123",
  VARSLING_SECRET: "x".repeat(40),
  VARSLING_FRA: "Smilefjeskartet <varsel@smilefjeskartet.no>",
};

describe("konfigurasjon", () => {
  it("er av uten miljøvariabler og sier hva som mangler", () => {
    expect(lesVarslingConfig({})).toEqual({ ok: false, mangler: [...PAAKREVDE_ENV] });
    expect(varslingAktiv({})).toBe(false);
  });

  it("regner tomme strenger (som GitHub gir for ukjente secrets) som manglende", () => {
    const r = lesVarslingConfig({ ...FULL, RESEND_API_KEY: "", VARSLING_FRA: "  " });
    expect(r).toEqual({ ok: false, mangler: ["RESEND_API_KEY", "VARSLING_FRA"] });
  });

  it("krever en lang nok hemmelighet og https til Redis", () => {
    expect(lesVarslingConfig({ ...FULL, VARSLING_SECRET: "kort" }).ok).toBe(false);
    expect(lesVarslingConfig({ ...FULL, UPSTASH_REDIS_REST_URL: "http://usikker" }).ok).toBe(false);
  });

  it("er på med alt satt, og bruker riktig nettadresse", () => {
    const r = lesVarslingConfig(FULL);
    expect(r).toMatchObject({ ok: true, config: { redisUrl: "https://eu1-noe.upstash.io", siteUrl: "https://smilefjeskartet.no" } });
    expect(lesVarslingConfig({ ...FULL, NEXT_PUBLIC_SITE_URL: "http://localhost:3006/" })).toMatchObject({ config: { siteUrl: "http://localhost:3006" } });
    expect(lesVarslingConfig({ ...FULL, NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toMatchObject({ config: { siteUrl: "https://smilefjeskartet.no" } });
  });
});

describe("API uten konfigurasjon", () => {
  beforeEach(() => {
    for (const k of PAAKREVDE_ENV) vi.stubEnv(k, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("abonner svarer 503 med en tydelig melding", async () => {
    const { POST } = await import("@/app/api/varsling/abonner/route");
    const res = await POST(
      new Request("http://localhost/api/varsling/abonner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ epost: "a@b.no" }),
      }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, kode: "ikke_konfigurert" });
  });

  it("bekreft og avmeld svarer 503", async () => {
    const bekreft = await import("@/app/api/varsling/bekreft/route");
    const avmeld = await import("@/app/api/varsling/avmeld/route");
    const req = (p: string) => new NextRequest(`http://localhost/api/varsling/${p}?token=abc`);
    expect((await bekreft.GET(req("bekreft"))).status).toBe(503);
    expect((await avmeld.GET(req("avmeld"))).status).toBe(503);
    expect((await avmeld.POST(req("avmeld"))).status).toBe(503);
  });
});

describe("utsendingsjobben uten konfigurasjon", () => {
  it("hopper over og avslutter med kode 0", () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME };
    for (const k of PAAKREVDE_ENV) env[k] = "";
    const ut = execFileSync(path.join("node_modules", ".bin", "tsx"), ["scripts/send-varsler.ts"], { env, encoding: "utf8" });
    expect(ut).toContain("Hopper over");
    expect(ut).toContain("UPSTASH_REDIS_REST_URL");
  }, 30_000);
});
