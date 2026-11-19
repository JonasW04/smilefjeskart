/**
 * Fryser dagsquizene i /quiz for i dag og i morgen (norsk tid) i generated/quiz.json.
 *
 *   npm run build:quiz
 *
 * Leser generated/steder.json (lages av build-data). Dager som alt er frosset, skrives
 * aldri om, så en dags quiz er den samme før og etter at nye tilsynsdata kommer.
 */
import fs from "node:fs";
import path from "node:path";
import { frysQuizer, osloDato } from "../lib/quiz";
import { lesFrosneQuizer, QUIZ_PATH } from "../lib/server/quiz";
import type { Datasett } from "../lib/types";

const datasett = JSON.parse(fs.readFileSync(path.join(process.cwd(), "generated", "steder.json"), "utf8")) as Datasett;
const iDag = osloDato(new Date());
const for_ = lesFrosneQuizer();
const etter = frysQuizer(for_, datasett.steder, iDag);
fs.writeFileSync(QUIZ_PATH, JSON.stringify(etter) + "\n");
const nye = Object.keys(etter).filter((d) => !(d in for_));
console.log(`Quiz: ${Object.keys(etter).length} frosne dager, nye: ${nye.join(", ") || "ingen"}.`);
