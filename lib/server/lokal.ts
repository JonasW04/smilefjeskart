/**
 * Lokale undersider av kommunene (kategori og strøk), memoisert per serverinstans som omrader.ts.
 */
import { rangerEtterSmil } from "../analyse";
import type { Kategori } from "../classify";
import { lokaleGrupper, strokForPostnr, type LokalGruppe, type LokalType } from "../lokal";
import type { Sted } from "../types";
import { getSteder } from "./data";
import { kommuner, type Omrade } from "./omrader";

export type LokalSide = LokalGruppe & { kommune: Omrade };

type Register = {
  liste: LokalSide[];
  /** Nøkkel: `${kommuneslug}/${slug}`. */
  bySti: Map<string, LokalSide>;
  perKommune: Map<string, LokalSide[]>;
};

let cache: Register | null = null;

function bygg(): Register {
  const kommuneByNr = new Map(kommuner().map((k) => [k.id, k]));
  const liste: LokalSide[] = [];
  for (const g of lokaleGrupper(getSteder())) {
    const kommune = kommuneByNr.get(g.kommunenr);
    if (kommune) liste.push({ ...g, kommune });
  }
  const perKommune = new Map<string, LokalSide[]>();
  for (const s of liste) {
    const l = perKommune.get(s.kommunenr);
    if (l) l.push(s);
    else perKommune.set(s.kommunenr, [s]);
  }
  return { liste, bySti: new Map(liste.map((s) => [`${s.kommune.slug}/${s.slug}`, s])), perKommune };
}

function data(): Register {
  return (cache ??= bygg());
}

export function lokaleSider(): LokalSide[] {
  return data().liste;
}

export function getLokalSide(kommuneSlug: string, slug: string): LokalSide | null {
  return data().bySti.get(`${kommuneSlug}/${slug}`) ?? null;
}

/** Lokale sider i en kommune, kategorier først, deretter strøk, flest steder først. */
export function lokaleSiderFor(kommunenr: string, type?: LokalType): LokalSide[] {
  const l = data().perKommune.get(kommunenr) ?? [];
  return type ? l.filter((s) => s.type === type) : l;
}

export function lokalUrlSti(s: Pick<LokalSide, "kommune" | "slug">): string {
  return `/kommune/${s.kommune.slug}/${s.slug}`;
}

/** Kategorisiden for et steds kategori i stedets kommune, hvis den finnes. */
export function kategoriSideFor(kommunenr: string | null, kategori: Kategori): LokalSide | null {
  if (!kommunenr) return null;
  return lokaleSiderFor(kommunenr, "kategori").find((s) => s.kategori === kategori) ?? null;
}

/** Strøksiden for et sted, hvis postnummeret hører til et strøk med egen side. */
export function strokSideFor(s: Pick<Sted, "kommunenr" | "postnr">): LokalSide | null {
  const strok = strokForPostnr(s.kommunenr, s.postnr);
  if (!strok || !s.kommunenr) return null;
  return lokaleSiderFor(s.kommunenr, "strok").find((x) => x.slug === strok.slug) ?? null;
}

/** Plass (1-basert) blant sidene av samme type i kommunen, etter andel smil i ordinære tilsyn. */
export function lokalPlassering(side: LokalSide): { plass: number; av: number } {
  const like = lokaleSiderFor(side.kommunenr, side.type);
  const rangert = rangerEtterSmil(like.map((s) => ({ key: s.slug, steder: s.steder.length, tilsyn: s.tilsyn, ordinaer: s.ordinaer })));
  return { plass: rangert.findIndex((g) => g.key === side.slug) + 1, av: rangert.length };
}
