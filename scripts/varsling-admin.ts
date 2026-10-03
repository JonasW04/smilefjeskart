/**
 * Små verktøy for eieren av varslingstjenesten.
 *
 *   npm run varsling:admin -- status                 Antall abonnenter, utboks og «sett»-tilsyn
 *   npm run varsling:admin -- slett <e-post>         Sletter abonnementet til en adresse
 *   npm run varsling:admin -- test-epost <e-post>    Sender et eksempel-sammendrag til en adresse
 *   npm run varsling:admin -- forhandsvis [mappe]    Skriver eksempel-e-postene som HTML-filer (trenger ingen nøkler)
 */
import fs from "node:fs";
import path from "node:path";
import { lesVarslingConfig, STANDARD_SITE_URL, type VarslingConfig } from "../lib/varsling/config";
import { avmeldHeaders, bekreftelsesEpost, sammendragEpost } from "../lib/varsling/epost";
import { upstashKv } from "../lib/varsling/kv";
import { resendMailer } from "../lib/varsling/mailer";
import { NOKLER, slettForEpost } from "../lib/varsling/store";
import { ferskeTilsyn, sorterTreff, vinduStart } from "../lib/varsling/tilsyn";
import { lagToken, nyId } from "../lib/varsling/token";
import type { Abonnement } from "../lib/varsling/typer";
import { gyldigEpost, maskerEpost, normaliserEpost } from "../lib/varsling/validering";
import type { Datasett } from "../lib/types";

// Les .env.local hvis den finnes (samme fil som `next dev` bruker). Variabler i terminalen vinner.
if (fs.existsSync(".env.local") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env.local");

function datasett(): Datasett {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "generated", "steder.json"), "utf8")) as Datasett;
}

function eksempel(siteUrl: string, secret: string) {
  const d = datasett();
  const iDag = d.generert.slice(0, 10);
  const treff = sorterTreff(ferskeTilsyn(d.steder, vinduStart(iDag, 30), iDag).filter((t) => t.kommunenr === "0301")).slice(0, 6);
  const abo: Pick<Abonnement, "omrade" | "omradeTekst" | "filtre"> = {
    omrade: { type: "kommuner", kommuner: ["0301"] },
    omradeTekst: "Oslo",
    filtre: ["smil", "strek", "sur"],
  };
  const id = nyId();
  const avmeldUrl = `${siteUrl}/api/varsling/avmeld?token=${encodeURIComponent(lagToken(secret, { f: "avmeld", id }))}`;
  const bekreftUrl = `${siteUrl}/api/varsling/bekreft?token=${encodeURIComponent(lagToken(secret, { f: "bekreft", id, exp: Math.floor(Date.now() / 1000) + 3600 }))}`;
  return {
    avmeldUrl,
    sammendrag: sammendragEpost({ abo, treff, siteUrl, avmeldUrl }),
    bekreft: bekreftelsesEpost({ abo, bekreftUrl, siteUrl }),
  };
}

function krevConfig(): VarslingConfig {
  const cfg = lesVarslingConfig();
  if (!cfg.ok) {
    console.error(`Varsling er ikke konfigurert. Mangler: ${cfg.mangler.join(", ")}`);
    process.exit(1);
  }
  return cfg.config;
}

async function main() {
  const [kommando, arg] = process.argv.slice(2);

  if (kommando === "forhandsvis") {
    const mappe = path.resolve(arg ?? ".varsling-forhandsvisning");
    fs.mkdirSync(mappe, { recursive: true });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || STANDARD_SITE_URL;
    const { sammendrag, bekreft } = eksempel(siteUrl, "forhandsvisning-".padEnd(40, "x"));
    for (const [navn, e] of [["sammendrag", sammendrag], ["bekreft", bekreft]] as const) {
      fs.writeFileSync(path.join(mappe, `${navn}.html`), e.html);
      fs.writeFileSync(path.join(mappe, `${navn}.txt`), `Emne: ${e.emne}\n\n${e.tekst}`);
    }
    console.log(`Skrev forhåndsvisninger til ${mappe}`);
    return;
  }

  if (kommando === "status") {
    const c = krevConfig();
    const kv = upstashKv(c.redisUrl, c.redisToken);
    const [aktive, utboks, sett, klar] = await kv.pipeline([
      ["SCARD", NOKLER.aktive],
      ["HLEN", NOKLER.utboks],
      ["SCARD", NOKLER.sett],
      ["GET", NOKLER.settKlar],
    ]);
    console.log(`Aktive abonnenter: ${aktive}`);
    console.log(`Sammendrag i utboksen: ${utboks}`);
    console.log(`Tilsyn i «sett»: ${sett}${klar ? ` (startet ${klar})` : " (ikke startet ennå – første kjøring sender ingenting)"}`);
    return;
  }

  if (kommando === "slett" || kommando === "test-epost") {
    if (!gyldigEpost(arg)) {
      console.error("Oppgi en gyldig e-postadresse.");
      process.exit(1);
    }
    const epost = normaliserEpost(arg);
    const c = krevConfig();
    if (kommando === "slett") {
      const fantes = await slettForEpost(upstashKv(c.redisUrl, c.redisToken), c.secret, epost);
      console.log(fantes ? `Slettet abonnementet til ${maskerEpost(epost)}.` : `Fant ikke noe aktivt abonnement for ${maskerEpost(epost)}.`);
      return;
    }
    const { sammendrag, avmeldUrl } = eksempel(c.siteUrl, c.secret);
    const res = await resendMailer(c.resendKey, c.fra).send({
      til: epost,
      emne: `[TEST] ${sammendrag.emne}`,
      html: sammendrag.html,
      tekst: sammendrag.tekst,
      headers: avmeldHeaders(avmeldUrl),
    });
    console.log(res.ok ? `Sendt til ${maskerEpost(epost)} (id ${res.id}).` : `Feilet (${res.status}): ${res.melding}`);
    if (!res.ok) process.exit(1);
    return;
  }

  console.log("Bruk: npm run varsling:admin -- <status | slett <e-post> | test-epost <e-post> | forhandsvis [mappe]>");
  process.exit(1);
}

main().catch((err) => {
  console.error(maskerEpost(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
