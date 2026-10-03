/**
 * Sending av e-post via Resend sitt REST-API (ingen avhengigheter).
 * https://resend.com/docs/api-reference/emails/send-email
 */
import { maskerEpost } from "./validering";

export type Epost = {
  /** Låst avsender for et sammendrag som allerede er forsøkt sendt. */
  fra?: string;
  til: string;
  emne: string;
  html: string;
  tekst: string;
  headers?: Record<string, string>;
  /** Resend ignorerer duplikater med samme nøkkel i 24 timer. */
  idempotensNokkel?: string;
};

export type SendResultat =
  | { ok: true; id: string }
  | {
      ok: false;
      /** true = ikke vits å prøve igjen (f.eks. ugyldig adresse). */
      permanent: boolean;
      /** true = dagskvoten hos Resend er brukt opp – stopp kjøringen. */
      kvote?: boolean;
      /** Avsenderkonto/protokollfeil: behold utboksen og stopp til oppsettet er rettet. */
      stopp?: boolean;
      status: number;
      melding: string;
    };

export interface Mailer {
  send(e: Epost): Promise<SendResultat>;
}

type Opts = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maksForsok?: number;
};

const vent = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function resendMailer(apiKey: string, fra: string, opts: Opts = {}): Mailer {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? vent;
  const maksForsok = opts.maksForsok ?? 4;

  return {
    async send(e: Epost): Promise<SendResultat> {
      const body = JSON.stringify({
        from: e.fra ?? fra,
        to: [e.til],
        subject: e.emne,
        html: e.html,
        text: e.tekst,
        ...(e.headers ? { headers: e.headers } : {}),
      });
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };
      if (e.idempotensNokkel) headers["Idempotency-Key"] = e.idempotensNokkel.slice(0, 256);

      let siste: SendResultat = { ok: false, permanent: false, status: 0, melding: "ikke forsøkt" };
      for (let forsok = 1; forsok <= maksForsok; forsok++) {
        let res: Response;
        try {
          res = await fetchFn("https://api.resend.com/emails", {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(15_000),
          });
        } catch (err) {
          siste = { ok: false, permanent: false, status: 0, melding: `nettverksfeil: ${(err as Error).name}` };
          await sleep(1000 * 2 ** (forsok - 1));
          continue;
        }
        const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
        if (res.ok && json.id) return { ok: true, id: json.id };

        const melding = maskerEpost(`${json.name ?? "feil"}: ${json.message ?? res.statusText}`).slice(0, 300);
        if (res.status === 429) {
          if (json.name === "daily_quota_exceeded" || json.name === "monthly_quota_exceeded") {
            return { ok: false, permanent: false, kvote: true, status: 429, melding };
          }
          const retryAfter = Number(res.headers.get("retry-after"));
          siste = { ok: false, permanent: false, status: 429, melding };
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 1000 * 2 ** (forsok - 1));
          continue;
        }
        if (res.status >= 500 || res.ok || (res.status === 409 && json.name === "concurrent_idempotent_requests")) {
          siste = { ok: false, permanent: false, status: res.status, melding };
          await sleep(1000 * 2 ** (forsok - 1));
          continue;
        }
        // En vellykket idempotent sending returnerer 2xx med den opprinnelige ID-en.
        // 409 er aldri en kvittering. Avsender-/payloadfeil gjelder hele køen.
        if (res.status === 401 || res.status === 403 || res.status === 409 || res.status === 400) {
          return { ok: false, permanent: false, stopp: true, status: res.status, melding };
        }
        // Øvrige 4xx: feil i forespørselen eller ugyldig mottaker. Ikke prøv igjen.
        return { ok: false, permanent: true, status: res.status, melding };
      }
      return siste;
    },
  };
}
