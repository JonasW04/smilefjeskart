/**
 * Påmeldingslogikken bak POST /api/varsling/abonner, skilt fra Next sin route-handler
 * så den kan testes med falsk Redis og falsk e-post.
 *
 * Svaret er det samme uansett om adressen er påmeldt fra før, ikke er det, eller har nådd
 * grensen for bekreftelses-e-poster – så API-et lekker aldri hvem som abonnerer.
 */
import type { Sted } from "../types";
import type { VarslingConfig } from "./config";
import { bekreftelsesEpost } from "./epost";
import type { Kv } from "./kv";
import type { Mailer } from "./mailer";
import { beskrivOmrade } from "./omrade";
import { lagreVenter, NOKLER, overGrense, slettAbonnement } from "./store";
import { BEKREFT_LEVETID_SEK, hmacHex, lagToken, nyId } from "./token";
import type { Abonnement } from "./typer";
import { validerAbonnement } from "./validering";

export const GRENSER = {
  /** Påmeldinger per IP per time. */
  ip: { antall: 10, vinduSek: 60 * 60 },
  /** Bekreftelses-e-poster per adresse per døgn. */
  epost: { antall: 3, vinduSek: 24 * 60 * 60 },
  /** Bekreftelses-e-poster totalt per døgn (vern mot misbruk av e-postkvoten). */
  global: { antall: 300, vinduSek: 24 * 60 * 60 },
} as const;

export type ApiSvar = { status: number; body: { ok: boolean; melding: string; feil?: Record<string, string> } };

export type AbonnerDeps = {
  kv: Kv;
  mailer: Mailer;
  config: VarslingConfig;
  steder: readonly Sted[];
  kommuneFinnes: (nr: string) => boolean;
  naa?: Date;
  logg?: (melding: string) => void;
};

export const SJEKK_INNBOKSEN = "Sjekk innboksen! Vi har sendt deg en e-post med en bekreftelseslenke.";

const ok = (): ApiSvar => ({ status: 200, body: { ok: true, melding: SJEKK_INNBOKSEN } });

export async function behandleAbonnement(body: unknown, meta: { ip: string }, deps: AbonnerDeps): Promise<ApiSvar> {
  const naa = deps.naa ?? new Date();
  const logg = deps.logg ?? (() => {});

  // Honningkrukke: usynlig felt som bare roboter fyller ut. Late som alt gikk bra.
  const b = body as Record<string, unknown> | null;
  if (b && typeof b === "object" && typeof b.nettside === "string" && b.nettside.trim() !== "") return ok();

  const v = validerAbonnement(body, deps.kommuneFinnes);
  if (!v.ok) {
    return { status: 400, body: { ok: false, melding: "Noe i skjemaet må fikses.", feil: v.feil } };
  }
  const { input } = v;
  const { kv, config } = deps;

  try {
    const ipHash = hmacHex(config.secret, "ip", meta.ip || "ukjent");
    if (await overGrense(kv, NOKLER.rl("ip", ipHash), GRENSER.ip.antall, GRENSER.ip.vinduSek)) {
      return { status: 429, body: { ok: false, melding: "Oi, det gikk fort! Vent litt før du prøver igjen." } };
    }
    const dag = naa.toISOString().slice(0, 10);
    if (await overGrense(kv, NOKLER.rl("global", dag), GRENSER.global.antall, GRENSER.global.vinduSek)) {
      return { status: 429, body: { ok: false, melding: "Det er veldig mange påmeldinger i dag. Prøv igjen i morgen." } };
    }
    const epostHash = hmacHex(config.secret, "rl-epost", input.epost);
    if (await overGrense(kv, NOKLER.rl("epost", epostHash), GRENSER.epost.antall, GRENSER.epost.vinduSek)) {
      // Samme svar som ellers, så ingen kan sjekke om en adresse er i bruk.
      logg("Grense for bekreftelses-e-post nådd for en adresse – sender ikke.");
      return ok();
    }

    const abo: Abonnement = {
      ...input,
      id: nyId(),
      status: "venter",
      omradeTekst: beskrivOmrade(input.omrade, deps.steder),
      opprettet: naa.toISOString(),
    };
    await lagreVenter(kv, abo);

    const exp = Math.floor(naa.getTime() / 1000) + BEKREFT_LEVETID_SEK;
    const token = lagToken(config.secret, { f: "bekreft", id: abo.id, exp });
    const bekreftUrl = `${config.siteUrl}/api/varsling/bekreft?token=${encodeURIComponent(token)}`;
    const innhold = bekreftelsesEpost({ abo, bekreftUrl, siteUrl: config.siteUrl });
    const res = await deps.mailer.send({
      til: abo.epost,
      emne: innhold.emne,
      html: innhold.html,
      tekst: innhold.tekst,
      idempotensNokkel: `bekreft-${abo.id}`,
    });
    if (!res.ok) {
      logg(`Klarte ikke å sende bekreftelse (status ${res.status}): ${res.melding}`);
      await slettAbonnement(kv, config.secret, abo.id).catch(() => {});
      // 422 = Resend avviser selve mottakeradressen. 401/403 o.l. er konfigurasjonsfeil hos oss.
      if (res.permanent && res.status === 422) {
        return { status: 400, body: { ok: false, melding: "Vi fikk ikke sendt til den adressen. Sjekk at den er riktig.", feil: { epost: "Vi fikk ikke sendt til denne adressen." } } };
      }
      return { status: 502, body: { ok: false, melding: "Vi fikk ikke sendt e-posten akkurat nå. Prøv igjen om litt." } };
    }
    return ok();
  } catch (err) {
    logg(`Påmelding feilet: ${(err as Error).message}`);
    return { status: 503, body: { ok: false, melding: "Varslingstjenesten er midlertidig utilgjengelig. Prøv igjen senere." } };
  }
}
