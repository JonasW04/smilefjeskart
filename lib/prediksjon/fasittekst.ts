/** Tekst om fasiten på /prediksjon, i egen fil så dommen kan testes. */
import type { FasitMaal } from "./typer";

/** To desimaler med norsk komma, samme formatering som tallene ellers på siden. */
const toDesimaler = (x: number) => x.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Modellens rangering mot en tommelfingerregel. `regel` er regelens visningsnavn. */
export function rangeringsdom(m: FasitMaal, regel: string): string {
  const [lav, hoy] = m.aucIntervall;
  const innledning = `Rangering (AUC): ${toDesimaler(m.modell.auc)} for modellen (95 % intervall ${toDesimaler(lav)}–${toDesimaler(hoy)}) mot ${toDesimaler(m.heuristikk.auc)} for «${regel.toLowerCase()}».`;
  // Sammenlign tallene slik de vises, så teksten aldri sier «over» om to like tall.
  // Math.round(0.575 * 100) gir 57, mens visningen gir 0,58.
  const vist = (x: number) => Number(toDesimaler(x).replace(",", "."));
  if (vist(lav) > vist(m.heuristikk.auc)) return innledning + " Hele intervallet ligger over tommelfingerregelen, så modellen rangerer bedre.";
  if (m.modell.auc > m.heuristikk.auc) return innledning + " Modellen ligger foran, men intervallet overlapper ennå tommelfingerregelen.";
  return innledning + " Foreløpig slår ikke modellen tommelfingerregelen.";
}
