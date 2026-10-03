/** Falsk Redis og e-post for tester. Oppfører seg som Upstash REST for kommandoene vi bruker. */
import type { Arg, Kv } from "@/lib/varsling/kv";
import type { Epost, Mailer, SendResultat } from "@/lib/varsling/mailer";
import type { VarslingConfig } from "@/lib/varsling/config";
import type { Sted, Tilsyn } from "@/lib/types";

type Verdi = { v: string | Set<string> | Map<string, string>; utloper?: number };

export class MinneKv implements Kv {
  data = new Map<string, Verdi>();
  naa = 0;
  kall: Arg[][] = [];
  feilPaa: string | null = null;

  private hent(k: string): Verdi | undefined {
    const v = this.data.get(k);
    if (v?.utloper !== undefined && v.utloper <= this.naa) {
      this.data.delete(k);
      return undefined;
    }
    return v;
  }
  private set(k: string): Set<string> {
    const v = this.hent(k);
    if (v && v.v instanceof Set) return v.v;
    const s = new Set<string>();
    this.data.set(k, { v: s });
    return s;
  }
  private hash(k: string): Map<string, string> {
    const v = this.hent(k);
    if (v && v.v instanceof Map) return v.v;
    const m = new Map<string, string>();
    this.data.set(k, { v: m });
    return m;
  }

  async cmd<T>(...args: Arg[]): Promise<T> {
    return this.kjor(args) as T;
  }

  async pipeline(cmds: Arg[][]): Promise<unknown[]> {
    return cmds.map((c) => this.kjor(c));
  }

  ttl(k: string): number | undefined {
    return this.hent(k)?.utloper;
  }

  private kjor(args: Arg[]): unknown {
    this.kall.push(args);
    const [c, ...r] = args.map(String);
    const cmd = c.toUpperCase();
    if (this.feilPaa === cmd) throw new Error(`falsk feil på ${cmd}`);
    switch (cmd) {
      case "EVAL": {
        const [script, antall, ...resten] = r;
        const keys = resten.slice(0, Number(antall));
        const argv = resten.slice(Number(antall));
        // Hver dispatch kjører synkront som én Redis-operasjon. De ekte Lua-skriptene
        // valideres også mot Redis i store-redis.test.ts når Redis er tilgjengelig.
        if (script.startsWith("-- varsling:bekreft/v1")) {
          const json = this.kjor(["GET", keys[0]]);
          if (!json) return "ukjent";
          const abo = JSON.parse(String(json));
          if (abo.status === "aktiv") return "ok";
          if ((this.kjor(["GET", keys[1]]) || "") !== argv[2]) return "endret";
          if (argv[2] && argv[2] !== argv[0]) {
            this.kjor(["DEL", keys[4], keys[5]]);
            this.kjor(["SREM", keys[2], argv[2]]);
            this.kjor(["HDEL", keys[3], argv[2]]);
          }
          this.kjor(["SET", keys[0], JSON.stringify({ ...abo, status: "aktiv", bekreftet: argv[1] })]);
          this.kjor(["SADD", keys[2], argv[0]]);
          this.kjor(["SET", keys[1], argv[0]]);
          return "ok";
        }
        if (script.startsWith("-- varsling:slett/v1")) {
          const fantes = this.hent(keys[0]) ? 1 : 0;
          this.kjor(["DEL", keys[0], keys[3]]);
          this.kjor(["SREM", keys[1], argv[0]]);
          this.kjor(["HDEL", keys[2], argv[0]]);
          if (argv[1] === "1" && this.kjor(["GET", keys[4]]) === argv[0]) this.kjor(["DEL", keys[4]]);
          return fantes;
        }
        if (script.startsWith("-- varsling:grense/v1")) {
          const antall = this.kjor(["INCR", keys[0]]) as number;
          if (antall === 1) this.kjor(["EXPIRE", keys[0], argv[0]]);
          return antall;
        }
        if (script.startsWith("-- varsling:utboks/v1") || script.startsWith("-- varsling:kvittering/v1")) {
          const json = this.kjor(["GET", keys[0]]);
          if (!json || JSON.parse(String(json)).status !== "aktiv") return 0;
          if (script.startsWith("-- varsling:utboks/v1")) this.kjor(["HSET", keys[1], argv[0], argv[1]]);
          else this.kjor(["SET", keys[1], argv[0]]);
          return 1;
        }
        throw new Error("MinneKv støtter ikke dette Lua-skriptet");
      }
      case "SCAN": {
        const keys = [...this.data.keys()].filter((k) => this.hent(k));
        const match = r.indexOf("MATCH");
        const prefix = match >= 0 ? r[match + 1].replace(/\*$/, "") : "";
        const count = r.indexOf("COUNT");
        const storrelse = count >= 0 ? Number(r[count + 1]) : 10;
        const filtrert = keys.filter((k) => k.startsWith(prefix));
        const start = Number(r[0]);
        const slutt = Math.min(start + storrelse, filtrert.length);
        return [slutt < filtrert.length ? String(slutt) : "0", filtrert.slice(start, slutt)];
      }
      case "GET": {
        const v = this.hent(r[0]);
        return typeof v?.v === "string" ? v.v : null;
      }
      case "SET": {
        const [k, val, ...opts] = r;
        const up = opts.map((o) => o.toUpperCase());
        if (up.includes("NX") && this.hent(k)) return null;
        const exI = up.indexOf("EX");
        this.data.set(k, { v: val, utloper: exI >= 0 ? this.naa + Number(opts[exI + 1]) * 1000 : undefined });
        return "OK";
      }
      case "DEL":
        return r.filter((k) => this.data.delete(k)).length;
      case "EXPIRE": {
        const v = this.hent(r[0]);
        if (!v) return 0;
        v.utloper = this.naa + Number(r[1]) * 1000;
        return 1;
      }
      case "INCR": {
        const v = this.hent(r[0]);
        const n = Number(typeof v?.v === "string" ? v.v : 0) + 1;
        this.data.set(r[0], { v: String(n), utloper: v?.utloper });
        return n;
      }
      case "SADD": {
        const s = this.set(r[0]);
        let n = 0;
        for (const m of r.slice(1)) {
          if (!s.has(m)) {
            s.add(m);
            n++;
          }
        }
        return n;
      }
      case "SREM": {
        const s = this.set(r[0]);
        return r.slice(1).filter((m) => s.delete(m)).length;
      }
      case "SMEMBERS":
        return [...this.set(r[0])];
      case "SCARD":
        return this.set(r[0]).size;
      case "MGET":
        return r.map((k) => {
          const v = this.hent(k);
          return typeof v?.v === "string" ? v.v : null;
        });
      case "HSET": {
        const h = this.hash(r[0]);
        for (let i = 1; i + 1 < r.length; i += 2) h.set(r[i], r[i + 1]);
        return (r.length - 1) / 2;
      }
      case "HGET":
        return this.hash(r[0]).get(r[1]) ?? null;
      case "HMGET":
        return r.slice(1).map((f) => this.hash(r[0]).get(f) ?? null);
      case "HDEL":
        return r.slice(1).filter((f) => this.hash(r[0]).delete(f)).length;
      case "HGETALL":
        return [...this.hash(r[0])].flat();
      case "HLEN":
        return this.hash(r[0]).size;
      default:
        throw new Error(`MinneKv støtter ikke ${cmd}`);
    }
  }
}

export class FalskMailer implements Mailer {
  sendt: Epost[] = [];
  svar: Array<SendResultat> = [];
  async send(e: Epost): Promise<SendResultat> {
    const neste = this.svar.shift();
    if (neste && !neste.ok) return neste;
    this.sendt.push(e);
    return { ok: true, id: `id-${this.sendt.length}` };
  }
}

export const CONFIG: VarslingConfig = {
  redisUrl: "https://falsk.upstash.io",
  redisToken: "token",
  resendKey: "re_test",
  secret: "test-hemmelighet-som-er-lang-nok-1234567890",
  fra: "Smilefjeskartet <varsel@example.com>",
  siteUrl: "https://smilefjeskartet.no",
};

export function tilsyn(dato: string, karakter: number, oppfolging = false): Tilsyn {
  return { dato, karakter, temaer: [karakter, 0, 0, 0], oppfolging };
}

export function sted(p: Partial<Sted> & { id: string }): Sted {
  return {
    slug: p.id,
    navn: `Sted ${p.id}`,
    orgnr: null,
    adresse: "Gata 1",
    postnr: "0001",
    poststed: "Oslo",
    kommunenr: "0301",
    kommune: "Oslo",
    fylkenr: "03",
    fylke: "Oslo",
    kjede: null,
    kjedeSlug: null,
    kategori: "annet",
    lat: 59.91,
    lng: 10.75,
    tilsyn: [],
    ...p,
  };
}
