/**
 * Minimal Redis-klient mot Upstash sitt REST-API (ingen avhengigheter).
 * https://upstash.com/docs/redis/features/restapi
 */

export type Arg = string | number;

export interface Kv {
  cmd<T = unknown>(...args: Arg[]): Promise<T>;
  /** Kjører flere kommandoer i én HTTP-forespørsel (ikke atomisk). Kaster hvis én feiler. */
  pipeline(cmds: Arg[][]): Promise<unknown[]>;
}

export class KvFeil extends Error {
  constructor(melding: string) {
    super(melding);
    this.name = "KvFeil";
  }
}

const TIMEOUT_MS = 10_000;

export function upstashKv(url: string, token: string, fetchFn: typeof fetch = fetch): Kv {
  async function post(path: string, body: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchFn(`${url}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (e) {
      throw new KvFeil(`Redis utilgjengelig: ${(e as Error).name}`);
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new KvFeil(`Redis svarte ${res.status} uten JSON`);
    }
    if (!res.ok && !Array.isArray(json)) {
      const err = (json as { error?: string })?.error ?? "ukjent feil";
      throw new KvFeil(`Redis svarte ${res.status}: ${err}`);
    }
    return json;
  }

  return {
    async cmd<T>(...args: Arg[]): Promise<T> {
      const json = (await post("", args)) as { result?: T; error?: string };
      if (json.error) throw new KvFeil(`Redis-feil: ${json.error}`);
      return json.result as T;
    },
    async pipeline(cmds: Arg[][]): Promise<unknown[]> {
      if (cmds.length === 0) return [];
      const json = (await post("/pipeline", cmds)) as Array<{ result?: unknown; error?: string }>;
      return json.map((r) => {
        if (r.error) throw new KvFeil(`Redis-feil: ${r.error}`);
        return r.result;
      });
    },
  };
}

/** Deler en liste i biter (Upstash har grenser for størrelse per forespørsel). */
export function biter<T>(liste: readonly T[], storrelse: number): T[][] {
  const ut: T[][] = [];
  for (let i = 0; i < liste.length; i += storrelse) ut.push(liste.slice(i, i + storrelse));
  return ut;
}
