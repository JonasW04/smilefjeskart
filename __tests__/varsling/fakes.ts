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
