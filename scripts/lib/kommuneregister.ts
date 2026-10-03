import { titleCase } from "../../lib/text";
import type { Kommune } from "./pipeline";

const KOMMUNER_URL = "https://ws.geonorge.no/kommuneinfo/v1/kommuner";
const POSTNR_URL = "https://www.bring.no/postnummerregister-ansi.txt";
// Et landsdekkende register har flere tusen postnumre. En kort fil er ikke trygge produksjonsdata.
const MIN_POSTNUMRE = 1000;

/** Kommuneoppslag for postnumre. Kartverkets navn er valgfrie; Bring leverer selve koblingen. */
export async function lastKommuneregister(kjentePostnumre: readonly string[] = []): Promise<(postnr: string) => Kommune | null> {
  const navn = new Map<string, string>();
  try {
    const res = await fetch(KOMMUNER_URL);
    if (res.ok) {
      for (const k of (await res.json()) as Array<{ kommunenummer: string; kommunenavnNorsk: string }>) {
        navn.set(k.kommunenummer, k.kommunenavnNorsk);
      }
    }
  } catch (e) {
    console.warn("Kunne ikke hente kommunenavn fra Kartverket:", e);
  }

  const register = new Map<string, Kommune>();
  try {
    const res = await fetch(POSTNR_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = new TextDecoder("latin1").decode(await res.arrayBuffer());
    for (const line of text.split(/\r?\n/)) {
      const [postnr, , kommunenr, kommunenavn] = line.split("\t");
      if (!/^\d{4}$/.test(postnr ?? "") || !/^\d{4}$/.test(kommunenr ?? "") || !kommunenavn?.trim()) continue;
      register.set(postnr, { nr: kommunenr, navn: navn.get(kommunenr) ?? titleCase(kommunenavn) });
    }
  } catch (e) {
    throw new Error(`Kunne ikke hente postnummerregister – avbryter for å bevare gode data: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (register.size < MIN_POSTNUMRE) {
    throw new Error(`Mistenkelig få postnumre i postnummerregister (${register.size}) – avbryter for å bevare gode data.`);
  }
  const mangler = [...new Set(kjentePostnumre)].filter((postnr) => !register.has(postnr));
  if (mangler.length > 0) {
    throw new Error(`Postnummerregister mangler ${mangler.length} tidligere berikede postnumre (${mangler.slice(0, 20).join(", ")}) – avbryter for å bevare gode data.`);
  }
  console.log(`Postnummerregister: ${register.size} postnumre, ${navn.size} kommunenavn`);
  return (postnr) => register.get(postnr) ?? null;
}
