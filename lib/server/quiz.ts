/** Serverside tilgang til generated/quiz.json: dagsquizene datajobben har frosset. */
import fs from "node:fs";
import path from "node:path";
import type { FrosneQuizer } from "../quiz";

export const QUIZ_PATH = path.join(process.cwd(), "generated", "quiz.json");

/** Frosne dagsquizer. Mangler fila, regnes alle dager ut fra dataene. */
export function lesFrosneQuizer(fil = QUIZ_PATH): FrosneQuizer {
  try {
    return JSON.parse(fs.readFileSync(fil, "utf8")) as FrosneQuizer;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}
