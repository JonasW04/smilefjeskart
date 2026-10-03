/**
 * Sender daglige smilefjesvarsler på e-post.
 *
 *   npm run send:varsler
 *
 * Kjøres i GitHub Actions rett etter at generated/steder.json er oppdatert. Uten miljøvariablene
 * (se docs/varsling.md) skriver den bare at den hopper over, og avslutter med kode 0.
 * Skriver aldri ut e-postadresser.
 */
import fs from "node:fs";
import path from "node:path";
import { lesVarslingConfig } from "../lib/varsling/config";
import { upstashKv } from "../lib/varsling/kv";
import { resendMailer } from "../lib/varsling/mailer";
import { kjorUtsending, MAKS_NYE_STANDARD } from "../lib/varsling/utsending";
import { maskerEpost } from "../lib/varsling/validering";
import type { Datasett } from "../lib/types";

const iActions = process.env.GITHUB_ACTIONS === "true";

function logg(m: string) {
  console.log(`[varsling] ${maskerEpost(m)}`);
}

function advar(m: string) {
  const ren = maskerEpost(m);
  console.warn(iActions ? `::warning title=Varsling::${ren}` : `[varsling] ADVARSEL: ${ren}`);
}

async function main() {
  const cfg = lesVarslingConfig();
  if (!cfg.ok) {
    logg(`Varsling er ikke konfigurert (mangler ${cfg.mangler.join(", ")}). Hopper over – ingenting sendt.`);
    return;
  }
  const { config } = cfg;

  const fil = path.join(process.cwd(), "generated", "steder.json");
  const datasett = JSON.parse(fs.readFileSync(fil, "utf8")) as Datasett;
  logg(`Datasett generert ${datasett.generert} med ${datasett.steder.length} steder.`);

  const maksNye = Number(process.env.VARSLING_MAKS_NYE) || MAKS_NYE_STANDARD;
  const rapport = await kjorUtsending({
    kv: upstashKv(config.redisUrl, config.redisToken),
    mailer: resendMailer(config.resendKey, config.fra),
    config,
    datasett,
    logg,
    advar,
    maksNye,
  });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rader = Object.entries(rapport).map(([k, v]) => `| ${k} | ${v} |`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ["### Smilefjesvarsler", "", "| | |", "|---|---|", ...rader, ""].join("\n"));
  }
}

main().catch((err) => {
  const melding = maskerEpost(err instanceof Error ? err.message : String(err));
  console.error(iActions ? `::error title=Varsling::${melding}` : `[varsling] FEIL: ${melding}`);
  process.exit(1);
});
