import { describe, expect, it, vi } from "vitest";
import { resendMailer, type Epost } from "@/lib/varsling/mailer";

const epost: Epost = { til: "mottaker@example.no", emne: "Varsel", html: "<p>Varsel</p>", tekst: "Varsel", idempotensNokkel: "fast-nokkel" };
const svar = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("Resend-protokollen", () => {
  it("venter på en samtidig forespørsel i stedet for å telle 409 som levert", async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(svar(409, { name: "concurrent_idempotent_requests", message: "in progress" }))
      .mockResolvedValueOnce(svar(200, { id: "akseptert" }));
    const mailer = resendMailer("test", "fra@example.no", { fetchFn, sleep: async () => {} });
    expect(await mailer.send(epost)).toEqual({ ok: true, id: "akseptert" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][1]?.body).toBe(fetchFn.mock.calls[1][1]?.body);
  });

  it("rapporterer en endret idempotent forespørsel som feil", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(svar(409, { name: "invalid_idempotent_request", message: "body changed" }));
    const mailer = resendMailer("test", "fra@example.no", { fetchFn, sleep: async () => {} });
    expect(await mailer.send(epost)).toMatchObject({ ok: false, permanent: false, stopp: true, status: 409 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stopper ved avsenderfeil uten å kaste kølagte e-poster", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(svar(403, { name: "validation_error", message: "domain not verified" }));
    const mailer = resendMailer("test", "fra@example.no", { fetchFn, sleep: async () => {} });
    expect(await mailer.send(epost)).toMatchObject({ ok: false, permanent: false, stopp: true, status: 403 });
  });

  it("godtar bare en bekreftet 2xx-respons med e-post-ID", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(svar(200, {}));
    const mailer = resendMailer("test", "fra@example.no", { fetchFn, sleep: async () => {}, maksForsok: 1 });
    expect(await mailer.send(epost)).toMatchObject({ ok: false, permanent: false, status: 200 });
  });
});
