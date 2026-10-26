import { execFileSync } from "node:child_process";
import type { ArkivertSpaadom } from "../../lib/prediksjon/fasit";
import type { PrediksjonData } from "../../lib/prediksjon/typer";

/** Leser tidligere publiserte generated/prediksjon.json fra git-historikken (trenger full historikk, ikke grunn klon). */
export function lesSpaadomsarkiv(root: string, sidenIso: string): { arkiv: ArkivertSpaadom[]; grunn: boolean } {
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const grunn = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  const commits = git(["log", `--since=${sidenIso}`, "--format=%H", "--", "generated/prediksjon.json"]).split("\n").filter(Boolean);
  const arkiv: ArkivertSpaadom[] = [];
  for (const sha of commits) {
    let innhold: string;
    try {
      innhold = git(["show", `${sha}:generated/prediksjon.json`]);
    } catch {
      continue;
    }
    const d = JSON.parse(innhold) as PrediksjonData;
    arkiv.push({ dataDato: d.dataDato, generert: d.generert, horisont: d.horisont, rytme: d.besok.rytme, etterSiste: d.utfall.etterSiste, steder: d.steder });
  }
  return { arkiv, grunn };
}
