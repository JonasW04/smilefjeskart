/**
 * Kjør kategori- og kjedeklassifiseringen på nytt mot eksisterende generated/steder.json
 * uten å hente Mattilsynets CSV på nytt. Oppdaterer generated/steder.json og public/data/kart.json.
 */
import fs from "node:fs";
import path from "node:path";
import { KATEGORI_NAVN, kategoriForSted, kjedeFraNavn, type Kategori } from "../lib/classify";
import type { Datasett } from "../lib/types";
import { toKartData } from "./lib/pipeline";

const ROOT = process.cwd();
const STEDER_PATH = path.join(ROOT, "generated", "steder.json");
const KART_PATH = path.join(ROOT, "public", "data", "kart.json");

const datasett = JSON.parse(fs.readFileSync(STEDER_PATH, "utf8")) as Datasett;
let endretKategori = 0;
let endretKjede = 0;

for (const s of datasett.steder) {
  const kjede = kjedeFraNavn(s.navn);
  const nyKategori = kategoriForSted(s.navn, kjede);
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
