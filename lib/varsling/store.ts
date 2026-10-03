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
  sendt: (id: string) => `${P}sendt:${id}`,
} as const;

// Lua holder lesing og skriving samlet. En pipeline kan ellers aktivere to abonnementer for
// samme adresse, eller gjenopprette et abonnement som ble slettet under bekreftelsen.
const BEKREFT = `-- varsling:bekreft/v1
local json = redis.call('GET', KEYS[1])
if not json then return 'ukjent' end
local abo = cjson.decode(json)
if abo.status == 'aktiv' then return 'ok' end
if (redis.call('GET', KEYS[2]) or '') ~= ARGV[3] then return 'endret' end
if ARGV[3] ~= '' and ARGV[3] ~= ARGV[1] then
  redis.call('DEL', KEYS[5], KEYS[6])
  redis.call('SREM', KEYS[3], ARGV[3])
  redis.call('HDEL', KEYS[4], ARGV[3])
end
abo.status = 'aktiv'
abo.bekreftet = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(abo))
redis.call('SADD', KEYS[3], ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
return 'ok'`;

const SLETT = `-- varsling:slett/v1
local fantes = redis.call('EXISTS', KEYS[1])
redis.call('DEL', KEYS[1], KEYS[4])
redis.call('SREM', KEYS[2], ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[1])
if ARGV[2] == '1' and redis.call('GET', KEYS[5]) == ARGV[1] then
  redis.call('DEL', KEYS[5])
end
return fantes`;

const TELL = `-- varsling:grense/v1
local antall = redis.call('INCR', KEYS[1])
if antall == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return antall`;

const LAGRE_UTBOKS = `-- varsling:utboks/v1
local json = redis.call('GET', KEYS[1])
if not json or cjson.decode(json).status ~= 'aktiv' then return 0 end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
return 1`;

const LAGRE_KVITTERING = `-- varsling:kvittering/v1
local json = redis.call('GET', KEYS[1])
if not json or cjson.decode(json).status ~= 'aktiv' then return 0 end
redis.call('SET', KEYS[2], ARGV[1])
return 1`;

/** En avmelding som skjer etter at jobben leste abonnementet, må ikke gjenopprette utboksen. */
export async function lagreUtboksHvisAktiv(kv: Kv, id: string, json: string): Promise<boolean> {
  return (await kv.cmd<number>("EVAL", LAGRE_UTBOKS, 2, NOKLER.abo(id), NOKLER.utboks, id, json)) === 1;
}

export async function lagreKvitteringHvisAktiv(kv: Kv, id: string, json: string): Promise<boolean> {
  return (await kv.cmd<number>("EVAL", LAGRE_KVITTERING, 2, NOKLER.abo(id), NOKLER.sendt(id), json)) === 1;
}

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
  for (let forsok = 0; forsok < 10; forsok++) {
    const gammelId = await kv.cmd<string | null>("GET", NOKLER.epost(hash));
    const resultat = await kv.cmd<"ok" | "ukjent" | "endret">(
      "EVAL", BEKREFT, 6,
      NOKLER.abo(id), NOKLER.epost(hash), NOKLER.aktive, NOKLER.utboks,
      NOKLER.abo(gammelId || id), NOKLER.sendt(gammelId || id),
      id, naa.toISOString(), gammelId || "",
    );
    if (resultat !== "endret") return resultat;
  }
  throw new Error("Abonnementet ble endret samtidig. Prøv bekreftelsen igjen.");
}

/** Sletter alt om et abonnement. Returnerer om det fantes. Idempotent. */
export async function slettAbonnement(kv: Kv, secret: string, id: string): Promise<boolean> {
  const abo = await hentAbonnement(kv, id);
  const peker = abo ? NOKLER.epost(epostHash(secret, abo.epost)) : NOKLER.abo(id);
  const fantes = await kv.cmd<number>(
    "EVAL", SLETT, 5, NOKLER.abo(id), NOKLER.aktive, NOKLER.utboks, NOKLER.sendt(id), peker,
    id, abo ? "1" : "0",
  );
  return fantes === 1;
}

/** Sletter både aktive og ventende abonnementer for en e-postadresse (kun admin-skriptet). */
export async function slettForEpost(kv: Kv, secret: string, epost: string): Promise<boolean> {
  let cursor = "0";
  const ids = new Set<string>();
  do {
    const [neste, nokler] = await kv.cmd<[string, string[]]>("SCAN", cursor, "MATCH", `${P}abo:*`, "COUNT", 100);
    cursor = neste;
    for (const bit of biter(nokler, 100)) {
      const verdier = await kv.cmd<unknown[]>("MGET", ...bit);
      for (const verdi of verdier) {
        const abo = parse(verdi);
        if (abo?.epost === epost) ids.add(abo.id);
      }
    }
  } while (cursor !== "0");
  let fantes = false;
  for (const id of ids) fantes = (await slettAbonnement(kv, secret, id)) || fantes;
  return fantes;
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
 * Lua setter utløp og teller atomisk, også om forrige vindu utløper under forespørselen.
 */
export async function overGrense(kv: Kv, nokkel: string, grense: number, vinduSek: number): Promise<boolean> {
  const antall = await kv.cmd<number>("EVAL", TELL, 1, nokkel, vinduSek);
  return Number(antall) > grense;
}
