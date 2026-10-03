/**
 * Smilefjes-domenet: karakterer, smilefjes og temaer.
 * Delt mellom datapipeline (scripts/) og nettsiden (app/).
 */

export type Smile = "smil" | "strek" | "sur";

export const SMILES: readonly Smile[] = ["smil", "strek", "sur"] as const;

/** Mattilsynets fire temaer, i samme rekkefølge som karakter1..karakter4 i CSV-en. */
export const TEMAER = [
  { key: "rutiner", navn: "Rutiner og ledelse", kort: "Rutiner" },
  { key: "lokaler", navn: "Lokaler og utstyr", kort: "Lokaler" },
  { key: "mat", navn: "Mathåndtering og tilberedning", kort: "Mathåndtering" },
  { key: "merking", navn: "Merking og sporbarhet", kort: "Merking" },
] as const;

/** Karakter 0–3 er vurderinger; 4 = ikke aktuelt, 5 = ikke vurdert; -1 = mangler. */
export function isGraded(k: number): boolean {
  return Number.isInteger(k) && k >= 0 && k <= 3;
}

/** Smilefjes for en karakter: 0–1 smil, 2 strek, 3 sur. */
export function smileFromKarakter(k: number): Smile | null {
  if (k === 0 || k === 1) return "smil";
  if (k === 2) return "strek";
  if (k === 3) return "sur";
  return null;
}

/**
 * Samlet karakter for et tilsyn. Bruker Mattilsynets total_karakter når den er gyldig,
 * ellers den dårligste temakarakteren (0–3).
 */
export function totalKarakter(total: number, temaer: readonly number[]): number {
  if (isGraded(total)) return total;
  const graded = temaer.filter(isGraded);
  return graded.length > 0 ? Math.max(...graded) : -1;
}

export const SMILE_LABEL: Record<Smile, string> = {
  smil: "Smil",
  strek: "Strekmunn",
  sur: "Sur munn",
};

/** Forklaring av hver karakter i hverdagsspråk. */
export const KARAKTER_FORKLARING: Record<number, string> = {
  0: "Alt i orden – ingen brudd på regelverket.",
  1: "Små avvik som ikke krever oppfølging.",
  2: "Brudd som må følges opp.",
  3: "Alvorlige brudd på regelverket.",
  4: "Ikke aktuelt for dette stedet.",
  5: "Ble ikke vurdert ved dette tilsynet.",
};
