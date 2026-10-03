/**
 * Kommuner, fylker og kjeder som egne sider: slugs, oppslag og memoiserte nøkkeltall.
 * Alt regnes ut én gang per serverinstans (data endres bare ved deploy).
 */
import { grupper, perAar, rangerEtterSmil, sisteDato, unikeSlugs, type AarRad, type Gruppe } from "../analyse";
import { tomFordeling, type Fordeling } from "../stats";
import { slugify } from "../text";
import type { Sted } from "../types";
import { getSteder } from "./data";

/** Minste antall ordinære tilsyn for å bli rangert blant kommunene. */
export const MIN_KOMMUNE = 50;
/** Minste antall steder for at en kjede rangeres. */
export const MIN_KJEDE_STEDER = 10;

export type OmradeType = "kommune" | "fylke" | "kjede";

export type Omrade = {
  type: OmradeType;
  /** Kommunenr, fylkenr eller kjedeslug. */
  id: string;
  slug: string;
  navn: string;
  /** Navn som skiller like kommunenavn: «Herøy (Nordland)». Ellers lik navn. */
  visningsnavn: string;
  /** Fylke for kommuner. */
  fylke: string | null;
  fylkeSlug: string | null;
  steder: Sted[];
  ordinaer: Fordeling;
  tilsyn: number;
};

type Register = {
  liste: Omrade[];
  bySlug: Map<string, Omrade>;
  byId: Map<string, Omrade>;
};

let cache: { kommune: Register; fylke: Register; kjede: Register; landAar: AarRad[]; sluttDato: string } | null = null;

function register(liste: Omrade[]): Register {
  return { liste, bySlug: new Map(liste.map((o) => [o.slug, o])), byId: new Map(liste.map((o) => [o.id, o])) };
}

function bygg(): NonNullable<typeof cache> {
  const steder = getSteder();
  const sluttDato = sisteDato(steder);

  const fylkeSlug = (navn: string) => slugify(navn);

  // Kommuner, nøkkel = kommunenr. Navn kan kollidere på tvers av fylker (Herøy).
  const kommuneSteder = new Map<string, Sted[]>();
  for (const s of steder) {
    if (!s.kommunenr || !s.kommune) continue;
    const l = kommuneSteder.get(s.kommunenr);
    if (l) l.push(s);
    else kommuneSteder.set(s.kommunenr, [s]);
  }
  const kommuneNr = [...kommuneSteder.keys()].sort();
  const kSlugs = unikeSlugs(
    kommuneNr,
    (nr) => slugify(kommuneSteder.get(nr)![0].kommune!),
    (nr) => {
      const s = kommuneSteder.get(nr)![0];
      return slugify(`${s.kommune} ${s.fylke ?? nr}`);
    },
  );

  const lagOmrade = (type: OmradeType, id: string, slug: string, navn: string, liste: Sted[], fylke: string | null): Omrade => {
    const g = grupper(liste, () => id).get(id) as Gruppe<string> | undefined;
    return {
      type,
      id,
      slug,
      navn,
      visningsnavn: navn,
      fylke,
      fylkeSlug: fylke ? fylkeSlug(fylke) : null,
      steder: liste,
      ordinaer: g?.ordinaer ?? tomFordeling(),
      tilsyn: g?.tilsyn ?? 0,
    };
  };

  const kommuner = kommuneNr.map((nr) => {
    const l = kommuneSteder.get(nr)!;
    return lagOmrade("kommune", nr, kSlugs.get(nr)!, l[0].kommune!, l, l[0].fylke);
  });
  const navneteller = new Map<string, number>();
  for (const k of kommuner) navneteller.set(k.navn, (navneteller.get(k.navn) ?? 0) + 1);
  for (const k of kommuner) if (navneteller.get(k.navn)! > 1 && k.fylke) k.visningsnavn = `${k.navn} (${k.fylke})`;

  const fylkeSteder = new Map<string, Sted[]>();
  for (const s of steder) {
    if (!s.fylkenr || !s.fylke) continue;
    const l = fylkeSteder.get(s.fylkenr);
    if (l) l.push(s);
    else fylkeSteder.set(s.fylkenr, [s]);
  }
  const fylker = [...fylkeSteder.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nr, l]) => lagOmrade("fylke", nr, fylkeSlug(l[0].fylke!), l[0].fylke!, l, null));

  const kjedeSteder = new Map<string, Sted[]>();
  for (const s of steder) {
    if (!s.kjedeSlug || !s.kjede) continue;
    const l = kjedeSteder.get(s.kjedeSlug);
    if (l) l.push(s);
    else kjedeSteder.set(s.kjedeSlug, [s]);
  }
  const kjeder = [...kjedeSteder.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, l]) => lagOmrade("kjede", slug, slug, l[0].kjede!, l, null));

  return {
    kommune: register(kommuner),
    fylke: register(fylker),
    kjede: register(kjeder),
    landAar: perAar(steder, sluttDato),
    sluttDato,
  };
}

function data() {
  return (cache ??= bygg());
}

export function kommuner(): Omrade[] {
  return data().kommune.liste;
}
export function fylker(): Omrade[] {
  return data().fylke.liste;
}
export function kjeder(): Omrade[] {
  return data().kjede.liste;
}

export function getOmrade(type: OmradeType, slug: string): Omrade | null {
  return data()[type].bySlug.get(slug) ?? null;
}

/** Slug for en kommune ut fra kommunenummer (til lenker fra stedssider). */
export function kommuneSlug(kommunenr: string | null): string | null {
  return kommunenr ? (data().kommune.byId.get(kommunenr)?.slug ?? null) : null;
}

export function fylkeSlugFraNr(fylkenr: string | null): string | null {
  return fylkenr ? (data().fylke.byId.get(fylkenr)?.slug ?? null) : null;
}

export function sluttDato(): string {
  return data().sluttDato;
}

/** Nasjonal tidsserie (memoisert). */
export function landPerAar(): AarRad[] {
  return data().landAar;
}

const aarCache = new Map<string, AarRad[]>();

export function omradePerAar(o: Omrade): AarRad[] {
  const key = `${o.type}:${o.id}`;
  let r = aarCache.get(key);
  if (!r) aarCache.set(key, (r = perAar(o.steder, sluttDato())));
  return r;
}

const rangCache = new Map<OmradeType, Omrade[]>();

/**
 * Rangering etter andel smil i ordinære tilsyn, med minste utvalg
 * (kommuner: ≥ MIN_KOMMUNE ordinære tilsyn, kjeder: ≥ MIN_KJEDE_STEDER steder, fylker: alle).
 */
export function rangert(type: OmradeType): Omrade[] {
  let r = rangCache.get(type);
  if (!r) {
    const liste = data()[type].liste;
    const kandidater = type === "kjede" ? liste.filter((o) => o.steder.length >= MIN_KJEDE_STEDER) : liste;
    const byId = new Map(kandidater.map((o) => [o.id, o]));
    r = rangerEtterSmil(
      kandidater.map((o) => ({ key: o.id, steder: o.steder.length, tilsyn: o.tilsyn, ordinaer: o.ordinaer })),
      type === "kommune" ? MIN_KOMMUNE : 1,
    ).map((g) => byId.get(g.key)!);
    rangCache.set(type, r);
  }
  return r;
}

/** Plass (1-basert) i rangeringen og antall rangerte, eller null hvis området ikke er rangert. */
export function plassering(o: Omrade): { plass: number; av: number } | null {
  const r = rangert(o.type);
  const i = r.findIndex((x) => x.id === o.id);
  return i < 0 ? null : { plass: i + 1, av: r.length };
}
