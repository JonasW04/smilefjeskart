/**
 * Finne nye tilsyn og matche dem mot abonnementer.
 *
 * Mattilsynets CSV får ofte tilsyn inn med flere dagers forsinkelse, så vi bruker ikke et
 * datovannmerke. I stedet husker vi nøklene («sett») til alle tilsyn innenfor et glidende
 * vindu, og alt som dukker opp i vinduet uten å være sett før, er nytt.
 */
import { smileFromKarakter, type Smile } from "../smile";
import type { Sted, Tilsyn } from "../types";
import { iOmrade } from "./omrade";
import type { Abonnement, VarselTilsyn } from "./typer";

/** Tilsyn eldre enn dette (regnet fra datasettets dato) varsles aldri om, og glemmes fra «sett». */
export const VINDU_DAGER = 60;

export function tilsynNokkel(stedId: string, t: Pick<Tilsyn, "dato" | "karakter">): string {
  return `${stedId}|${t.dato}|${t.karakter}`;
}

export function nokkelDato(key: string): string {
  return key.split("|")[1] ?? "";
}

export function vinduStart(iDag: string, dager = VINDU_DAGER): string {
  return new Date(Date.parse(iDag.slice(0, 10)) - dager * 86_400_000).toISOString().slice(0, 10);
}

/** Alle tilsyn med dato >= fraDato (og ikke i fremtiden), med karakter som gir et smilefjes. */
export function ferskeTilsyn(steder: readonly Sted[], fraDato: string, tilDato = "9999-12-31"): VarselTilsyn[] {
  const ut: VarselTilsyn[] = [];
  const sett = new Set<string>();
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (t.dato < fraDato || t.dato > tilDato || !smileFromKarakter(t.karakter)) continue;
      const key = tilsynNokkel(s.id, t);
      if (sett.has(key)) continue;
      sett.add(key);
      ut.push({
        key,
        stedId: s.id,
        slug: s.slug,
        navn: s.navn,
        adresse: s.adresse,
        poststed: s.poststed,
        kommunenr: s.kommunenr,
        kommune: s.kommune,
        lat: s.lat,
        lng: s.lng,
        dato: t.dato,
        karakter: t.karakter,
        oppfolging: t.oppfolging,
      });
    }
  }
  return ut;
}

export function nyeTilsyn(ferske: readonly VarselTilsyn[], sett: ReadonlySet<string>): VarselTilsyn[] {
  return ferske.filter((t) => !sett.has(t.key));
}

const ALVOR: Record<Smile, number> = { sur: 0, strek: 1, smil: 2 };

/** Sorterer verst først, så nyest først, så navn. */
export function sorterTreff(liste: VarselTilsyn[]): VarselTilsyn[] {
  return liste.sort((a, b) => {
    const sa = ALVOR[smileFromKarakter(a.karakter)!] ?? 3;
    const sb = ALVOR[smileFromKarakter(b.karakter)!] ?? 3;
    return sa - sb || b.dato.localeCompare(a.dato) || a.navn.localeCompare(b.navn, "nb");
  });
}

/** Tilsynene et abonnement skal varsles om. */
export function treffFor(abo: Pick<Abonnement, "omrade" | "filtre">, nye: readonly VarselTilsyn[]): VarselTilsyn[] {
  return sorterTreff(
    nye.filter((t) => {
      const sm = smileFromKarakter(t.karakter);
      return sm !== null && abo.filtre.includes(sm) && iOmrade(abo.omrade, t);
    }),
  );
}
