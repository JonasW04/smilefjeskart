/**
 * Daglig utsending av varsler. Kjøres av scripts/send-varsler.ts etter at tilsynsdataene er oppdatert.
 *
 * 1. Finn «ferske» tilsyn (innenfor VINDU_DAGER) og trekk fra de vi har sett før (Redis-SET).
 *    Første kjøring fyller bare settet og sender ingenting.
 * 2. Match nye tilsyn mot aktive abonnementer og legg ett sammendrag per abonnent i en utboks
 *    (Redis-HASH). Deretter merkes tilsynene som sett.
 * 3. Tøm utboksen: send, og fjern posten når Resend har tatt imot den.
 *
 * Idempotens: krasjer jobben etter steg 2, ligger sammendragene trygt i utboksen til neste kjøring.
 * Krasjer den midt i steg 2, finner neste kjøring de samme nye tilsynene og slår dem sammen med
 * det som allerede ligger i utboksen (duplikater fjernes på nøkkel). Hver e-post har i tillegg en
 * idempotensnøkkel hos Resend, så en ny kjøring samme dag ikke sender dobbelt.
 */
import { createHash } from "node:crypto";
import type { Datasett } from "../types";
import type { VarslingConfig } from "./config";
import { avmeldHeaders, sammendragEpost } from "./epost";
import { biter, type Kv } from "./kv";
import type { Epost, Mailer } from "./mailer";
import { hentAbonnement, hentAktive, lagreKvitteringHvisAktiv, lagreUtboksHvisAktiv, NOKLER } from "./store";
import { ferskeTilsyn, nokkelDato, nyeTilsyn, sorterTreff, treffFor, vinduStart } from "./tilsyn";
import { lagToken } from "./token";
import type { VarselTilsyn } from "./typer";

/** Flere nye tilsyn enn dette på én gang tyder på en dataendring (f.eks. nye ID-er), ikke ekte nyheter. */
export const MAKS_NYE_STANDARD = 2500;
/** Etter så mange mislykkede forsøk gir vi opp et sammendrag. */
export const MAKS_FORSOK = 3;
/** Pause mellom e-poster. Resend tillater 2 forespørsler i sekundet som standard. */
export const PAUSE_MS = 600;

export type UtboksPost = {
  treff: VarselTilsyn[];
  forsok: number;
  opprettet: string;
  /** Fryses før første sending; identisk HTTP-innhold ved omforsøk. Ingen mottakeradresse her. */
  melding?: Omit<Epost, "til">;
  /** Nye treff etter første forsøk venter i et eget sammendrag. */
  ventende?: VarselTilsyn[];
};

export type UtsendingDeps = {
  kv: Kv;
  mailer: Mailer;
  config: VarslingConfig;
  datasett: Datasett;
  naa?: Date;
  logg?: (melding: string) => void;
  advar?: (melding: string) => void;
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
  maksNye?: number;
};

export type UtsendingRapport = {
  modus: "seedet" | "normal" | "anomali";
  ferske: number;
  nye: number;
  abonnenter: number;
  lagtIUtboks: number;
  sendt: number;
  feilet: number;
  utsatt: number;
  fjernet: number;
  stoppetAvKvote: boolean;
  stoppetAvFeil: boolean;
};

const kort = (id: string) => id.slice(0, 6);

export function digestNokkel(id: string, treff: readonly VarselTilsyn[]): string {
  const h = createHash("sha256").update(treff.map((t) => t.key).sort().join("\n")).digest("hex").slice(0, 20);
  return `sammendrag-${id}-${h}`;
}

function parsePost(json: unknown): UtboksPost | null {
  if (typeof json !== "string") return null;
  try {
    const p = JSON.parse(json) as UtboksPost;
    return Array.isArray(p.treff) ? { ...p, forsok: Number(p.forsok) || 0 } : null;
  } catch {
    return null;
  }
}

function parseKvittering(json: unknown): { dag: string; nokkel: string } | null {
  if (typeof json !== "string") return null;
  try {
    const k = JSON.parse(json);
    return typeof k?.dag === "string" && typeof k?.nokkel === "string" ? k : null;
  } catch {
    return null;
  }
}

async function avsluttPost(kv: Kv, id: string, post: UtboksPost, naa: Date) {
  if (post.ventende?.length) {
    await lagreUtboksHvisAktiv(kv, id, JSON.stringify({ treff: post.ventende, forsok: 0, opprettet: naa.toISOString() }));
  } else {
    await kv.cmd("HDEL", NOKLER.utboks, id);
  }
}

async function leggTilSett(kv: Kv, nokler: string[]): Promise<void> {
  for (const bit of biter(nokler, 500)) await kv.cmd("SADD", NOKLER.sett, ...bit);
}

export async function kjorUtsending(deps: UtsendingDeps): Promise<UtsendingRapport> {
  const { kv, mailer, config, datasett } = deps;
  const naa = deps.naa ?? new Date();
  const logg = deps.logg ?? (() => {});
  const advar = deps.advar ?? logg;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pauseMs = deps.pauseMs ?? PAUSE_MS;
  const maksNye = deps.maksNye ?? MAKS_NYE_STANDARD;

  const rapport: UtsendingRapport = {
    modus: "normal",
    ferske: 0,
    nye: 0,
    abonnenter: 0,
    lagtIUtboks: 0,
    sendt: 0,
    feilet: 0,
    utsatt: 0,
    fjernet: 0,
    stoppetAvKvote: false,
    stoppetAvFeil: false,
  };

  const iDag = datasett.generert.slice(0, 10);
  const fra = vinduStart(iDag);
  const ferske = ferskeTilsyn(datasett.steder, fra, iDag);
  rapport.ferske = ferske.length;

  const klar = await kv.cmd<string | null>("GET", NOKLER.settKlar);
  const settListe = (await kv.cmd<string[]>("SMEMBERS", NOKLER.sett)) ?? [];
  const sett = new Set(settListe);

  // --- Første kjøring: bare husk det som finnes ---------------------------------
  if (!klar) {
    await leggTilSett(kv, ferske.map((t) => t.key));
    await kv.cmd("SET", NOKLER.settKlar, naa.toISOString());
    rapport.modus = "seedet";
    logg(`Første kjøring: husket ${ferske.length} tilsyn fra ${fra} til ${iDag}. Sender ingenting denne gangen.`);
    return rapport;
  }

  // --- Finn nye tilsyn og fyll utboksen ------------------------------------------
  const nye = nyeTilsyn(ferske, sett);
  rapport.nye = nye.length;
  logg(`${ferske.length} tilsyn i vinduet ${fra}–${iDag}, ${nye.length} nye siden sist.`);

  if (nye.length > maksNye) {
    rapport.modus = "anomali";
    advar(`Hele ${nye.length} nye tilsyn på én gang (grense ${maksNye}). Ser ut som en dataendring – merker dem som sett uten å varsle.`);
    await leggTilSett(kv, nye.map((t) => t.key));
  } else if (nye.length > 0) {
    const aktive = await hentAktive(kv);
    rapport.abonnenter = aktive.length;
    const nyeTreff = aktive.map((abo) => ({ abo, treff: treffFor(abo, nye) })).filter((x) => x.treff.length > 0);

    for (const bit of biter(nyeTreff, 100)) {
      const eksisterende = (await kv.cmd<unknown[]>("HMGET", NOKLER.utboks, ...bit.map((x) => x.abo.id))) ?? [];
      for (let i = 0; i < bit.length; i++) {
        const { abo, treff } = bit[i];
        const gammel = parsePost(eksisterende[i]);
        const laast = Boolean(gammel?.melding);
        const samlet = new Map((laast ? gammel?.ventende ?? [] : gammel?.treff ?? []).map((t) => [t.key, t]));
        const forsokte = new Set(laast ? gammel!.treff.map((t) => t.key) : []);
        for (const t of treff) if (!forsokte.has(t.key)) samlet.set(t.key, t);
        const post: UtboksPost = {
          ...(gammel ?? {}),
          treff: laast ? gammel!.treff : sorterTreff([...samlet.values()]),
          ...(laast ? { ventende: sorterTreff([...samlet.values()]) } : {}),
          forsok: gammel?.forsok ?? 0,
          opprettet: gammel?.opprettet ?? naa.toISOString(),
        };
        await lagreUtboksHvisAktiv(kv, abo.id, JSON.stringify(post));
      }
    }
    rapport.lagtIUtboks = nyeTreff.length;
    // Først nå er det trygt å merke tilsynene som sett.
    await leggTilSett(kv, nye.map((t) => t.key));
    logg(`${nyeTreff.length} av ${aktive.length} abonnenter har noe nytt.`);
  }

  // --- Glem tilsyn som har falt ut av vinduet -------------------------------------
  const gamle = settListe.filter((k) => nokkelDato(k) < fra);
  for (const bit of biter(gamle, 500)) await kv.cmd("SREM", NOKLER.sett, ...bit);

  // --- Tøm utboksen ---------------------------------------------------------------
  const flat = (await kv.cmd<string[]>("HGETALL", NOKLER.utboks)) ?? [];
  const poster: Array<[string, UtboksPost | null]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) poster.push([flat[i], parsePost(flat[i + 1])]);

  let forsteSending = true;
  for (const [id, lagretPost] of poster) {
    let post = lagretPost;
    const abo = await hentAbonnement(kv, id);
    if (!post || !abo || abo.status !== "aktiv" || post.treff.length === 0) {
      await kv.cmd("HDEL", NOKLER.utboks, id);
      rapport.fjernet++;
      continue;
    }
    const sendDag = naa.toISOString().slice(0, 10);
    const kvittering = parseKvittering(await kv.cmd("GET", NOKLER.sendt(id)));
    if (kvittering?.nokkel === digestNokkel(id, post.treff)) {
      // Resend tok imot, men forrige kjøring kan ha krasjet før køposten ble fjernet.
      await avsluttPost(kv, id, post, naa);
      rapport.fjernet++;
      continue;
    }
    if (kvittering?.dag === sendDag) {
      rapport.utsatt++;
      continue;
    }
    if (!forsteSending) await sleep(pauseMs);
    forsteSending = false;

    if (!post.melding) {
      const avmeldUrl = `${config.siteUrl}/api/varsling/avmeld?token=${encodeURIComponent(lagToken(config.secret, { f: "avmeld", id }))}`;
      const innhold = sammendragEpost({ abo, treff: post.treff, siteUrl: config.siteUrl, avmeldUrl });
      post = { ...post, melding: {
        fra: config.fra,
        emne: innhold.emne,
        html: innhold.html,
        tekst: innhold.tekst,
        headers: avmeldHeaders(avmeldUrl),
        idempotensNokkel: digestNokkel(id, post.treff),
      } };
      // Lagre før API-kallet: krasj etter aksept må ikke endre forespørselen.
      if (!await lagreUtboksHvisAktiv(kv, id, JSON.stringify(post))) {
        rapport.fjernet++;
        continue;
      }
    }
    const res = await mailer.send({ til: abo.epost, ...post.melding! });

    if (res.ok) {
      await lagreKvitteringHvisAktiv(kv, id, JSON.stringify({ dag: sendDag, nokkel: digestNokkel(id, post.treff) }));
      await avsluttPost(kv, id, post, naa);
      rapport.sendt++;
      continue;
    }
    if (res.kvote) {
      rapport.stoppetAvKvote = true;
      advar(`E-postkvoten hos Resend er brukt opp (${res.melding}). Resten venter i utboksen til neste kjøring.`);
      break;
    }
    if (res.stopp) {
      rapport.stoppetAvFeil = true;
      advar(`Sending stoppet (status ${res.status}): ${res.melding}. Utboksen beholdes til feilen er rettet.`);
      break;
    }
    const forsok = post.forsok + 1;
    if (res.permanent || forsok >= MAKS_FORSOK) {
      await avsluttPost(kv, id, post, naa);
      rapport.feilet++;
      advar(`Ga opp sammendrag til abonnent ${kort(id)}… (status ${res.status}): ${res.melding}`);
    } else {
      await lagreUtboksHvisAktiv(kv, id, JSON.stringify({ ...post, forsok }));
      rapport.utsatt++;
      advar(`Sammendrag til abonnent ${kort(id)}… feilet (status ${res.status}), prøver igjen neste kjøring.`);
    }
  }

  logg(
    `Ferdig: ${rapport.sendt} sendt, ${rapport.utsatt} utsatt, ${rapport.feilet} feilet, ${rapport.fjernet} fjernet fra utboksen.`,
  );
  return rapport;
}
