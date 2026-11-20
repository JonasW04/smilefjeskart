/**
 * Kjør kategori- og kjedeklassifiseringen på nytt mot eksisterende generated/steder.json
 * uten å hente Mattilsynets CSV på nytt. Oppdaterer generated/steder.json og public/data/kart.json.
 *
 * Bruker kildene i generated/kilder/. Med --hent oppdateres de fra Enhetsregisteret og OpenStreetMap først.
 */
import fs from "node:fs";
import path from "node:path";
import { KATEGORI_NAVN, kategoriForSted, kjedeFraNavn, type Kategori } from "../lib/classify";
import type { Datasett } from "../lib/types";
import { lagKildeoppslag, lesKilder, oppdaterKilder } from "./lib/kilder";
import { toKartData } from "./lib/pipeline";

const ROOT = process.cwd();
const STEDER_PATH = path.join(ROOT, "generated", "steder.json");
const KART_PATH = path.join(ROOT, "public", "data", "kart.json");

async function main() {
  const datasett = JSON.parse(fs.readFileSync(STEDER_PATH, "utf8")) as Datasett;
  const kilder = process.argv.includes("--hent")
    ? await oppdaterKilder(
        datasett.steder.flatMap((s) => (s.orgnr ? [s.orgnr] : [])),
        { tving: true },
      )
    : lesKilder();
  const kilderFor = lagKildeoppslag(kilder.brreg, kilder.osm);
  let endretKategori = 0;
  let endretKjede = 0;

  for (const s of datasett.steder) {
    const kjede = kjedeFraNavn(s.navn);
    const nyKategori = kategoriForSted(s.navn, kjede, kilderFor(s));
    const nyttKjedeNavn = kjede?.navn ?? null;
    const nyKjedeSlug = kjede?.slug ?? null;
    if (s.kategori !== nyKategori) {
      s.kategori = nyKategori;
      endretKategori++;
    }
    if (s.kjede !== nyttKjedeNavn || s.kjedeSlug !== nyKjedeSlug) {
      s.kjede = nyttKjedeNavn;
      s.kjedeSlug = nyKjedeSlug;
      endretKjede++;
    }
  }

  const { steder, ...meta } = datasett;
  const head = JSON.stringify(meta).slice(0, -1);
  const body = steder.map((s) => JSON.stringify(s)).join(",\n");
  fs.writeFileSync(STEDER_PATH, `${head},"steder":[\n${body}\n]}\n`, "utf8");
  fs.writeFileSync(
    KART_PATH,
    JSON.stringify(toKartData(steder, Object.keys(KATEGORI_NAVN) as Kategori[], datasett.generert)),
    "utf8",
  );

  console.log(`Reklassifiserte ${steder.length} steder: ${endretKategori} nye kategorier, ${endretKjede} nye kjeder`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
