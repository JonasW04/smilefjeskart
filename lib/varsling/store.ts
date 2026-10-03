/**
 * Lagring av abonnementer i Redis.
 *
 * Nøkler (alle med prefikset «varsling:»):
 *   abo:<id>          JSON med abonnementet. Ubekreftede har TTL på 48 t, aktive har ingen TTL.
 *   epost:<hmac>      id-en til det aktive abonnementet for en e-postadresse (én per adresse).
 *   aktive            SET med id-ene til alle aktive abonnementer.
 *   rl:<type>:<hmac>  tellere for rate limiting (med TTL). IP og e-post lagres kun som HMAC.
 *   sett, sett:klar   tilsyn som allerede er sett av utsendingsjobben (se utsending.ts).
 *   utboks            HASH abonnement-id → ventende sammendrag (se utsending.ts).
 */
import { biter, type Kv } from "./kv";
import { BEKREFT_LEVETID_SEK, hmacHex } from "./token";
import type { Abonnement } from "./typer";

export const P = "varsling:";
export const NOKLER = {
  abo: (id: string) => `${P}abo:${id}`,
  epost: (hash: string) => `${P}epost:${hash}`,
  aktive: `${P}aktive`,
  rl: (type: string, hash: string) => `${P}rl:${type}:${hash}`,
  sett: `${P}sett`,
  settKlar: `${P}sett:klar`,
  utboks: `${P}utboks`,
} as const;

export function epostHash(secret: string, epost: string): string {
  return hmacHex(secret, "epost", epost);
}

function parse(json: unknown): Abonnement | null {
  if (typeof json !== "string") return null;
  try {
    const a = JSON.parse(json) as Abonnement;
    return a && typeof a.id === "string" && typeof a.epost === "string" ? a : null;
  } catch {
    return null;
  }
}

export async function lagreVenter(kv: Kv, abo: Abonnement): Promise<void> {
  await kv.cmd("SET", NOKLER.abo(abo.id), JSON.stringify({ ...abo, status: "venter" }), "EX", BEKREFT_LEVETID_SEK);
}

export async function hentAbonnement(kv: Kv, id: string): Promise<Abonnement | null> {
  return parse(await kv.cmd("GET", NOKLER.abo(id)));
}

/**
 * Aktiverer et ventende abonnement. Har e-postadressen et annet aktivt abonnement fra før,
 * erstattes det (én aktiv påmelding per adresse – den nyeste vinner).
 * Idempotent: å bekrefte to ganger er helt greit.
 */
export async function bekreftAbonnement(kv: Kv, secret: string, id: string, naa = new Date()): Promise<"ok" | "ukjent"> {
  const abo = await hentAbonnement(kv, id);
  if (!abo) return "ukjent";
  if (abo.status === "aktiv") return "ok";

  const hash = epostHash(secret, abo.epost);
  const gammelId = await kv.cmd<string | null>("GET", NOKLER.epost(hash));
  const aktiv: Abonnement = { ...abo, status: "aktiv", bekreftet: naa.toISOString() };
  const cmds: Array<Array<string | number>> = [];
  if (gammelId && gammelId !== id) {
    cmds.push(["DEL", NOKLER.abo(gammelId)], ["SREM", NOKLER.aktive, gammelId], ["HDEL", NOKLER.utboks, gammelId]);
  }
  // SET uten EX fjerner TTL-en fra ventetiden.
  cmds.push(["SET", NOKLER.abo(id), JSON.stringify(aktiv)], ["SADD", NOKLER.aktive, id], ["SET", NOKLER.epost(hash), id]);
  await kv.pipeline(cmds);
  return "ok";
}

/** Sletter alt om et abonnement. Returnerer om det fantes. Idempotent. */
export async function slettAbonnement(kv: Kv, secret: string, id: string): Promise<boolean> {
  const abo = await hentAbonnement(kv, id);
  const cmds: Array<Array<string | number>> = [
    ["DEL", NOKLER.abo(id)],
    ["SREM", NOKLER.aktive, id],
    ["HDEL", NOKLER.utboks, id],
  ];
  if (abo) {
    const hash = epostHash(secret, abo.epost);
    const peker = await kv.cmd<string | null>("GET", NOKLER.epost(hash));
    if (peker === id) cmds.push(["DEL", NOKLER.epost(hash)]);
  }
  await kv.pipeline(cmds);
  return abo !== null;
}

/** Sletter det aktive abonnementet for en e-postadresse (for eieren/admin-skriptet). */
export async function slettForEpost(kv: Kv, secret: string, epost: string): Promise<boolean> {
  const hash = epostHash(secret, epost);
  const id = await kv.cmd<string | null>("GET", NOKLER.epost(hash));
  if (!id) return false;
  await slettAbonnement(kv, secret, id);
  await kv.cmd("DEL", NOKLER.epost(hash));
  return true;
}

/** Henter alle aktive abonnementer. Rydder bort id-er som peker på slettede abonnementer. */
export async function hentAktive(kv: Kv): Promise<Abonnement[]> {
  const ids = (await kv.cmd<string[]>("SMEMBERS", NOKLER.aktive)) ?? [];
  const ut: Abonnement[] = [];
  const doede: string[] = [];
  for (const bit of biter(ids, 100)) {
    const verdier = (await kv.cmd<unknown[]>("MGET", ...bit.map(NOKLER.abo))) ?? [];
    bit.forEach((id, i) => {
      const a = parse(verdier[i]);
      if (a && a.status === "aktiv") ut.push(a);
      else doede.push(id);
    });
  }
  if (doede.length > 0) await kv.cmd("SREM", NOKLER.aktive, ...doede);
  return ut;
}

/**
 * Fast-vindu-teller. Returnerer true hvis grensen er overskredet.
 * SET NX EX starter vinduet, INCR teller. Fungerer på alle Redis-versjoner.
 */
export async function overGrense(kv: Kv, nokkel: string, grense: number, vinduSek: number): Promise<boolean> {
  const [, antall] = await kv.pipeline([
    ["SET", nokkel, 0, "EX", vinduSek, "NX"],
    ["INCR", nokkel],
  ]);
  return Number(antall) > grense;
}
