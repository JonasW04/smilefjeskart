/**
 * Lager PNG-versjoner av smilefjesene til e-post (public/epost/*.png).
 * Mange e-postklienter viser verken SVG eller data-URI-er, så e-postene lenker til disse filene.
 *
 *   npx tsx scripts/lag-epost-ikoner.ts
 *
 * Bruker sharp, som følger med Next.js. Kjør på nytt hvis smilefjesene i lib/smiley.ts endres.
 */
import fs from "node:fs";
import path from "node:path";
import { smileySvg, type SmileyKind } from "../lib/smiley";

type Sharp = (input: Buffer, opts?: { density?: number }) => {
  resize(w: number, h: number): ReturnType<Sharp>;
  png(o?: { compressionLevel?: number }): ReturnType<Sharp>;
  toFile(fil: string): Promise<unknown>;
};

const STORRELSE = 96; // vises i 32–48 px, så 2x for skarpe skjermer

async function main() {
  // sharp er en valgfri avhengighet av Next; importeres dynamisk så typesjekken ikke krever den.
  const modul = "sharp";
  const sharp = ((await import(modul)) as { default: Sharp }).default;
  const mappe = path.join(process.cwd(), "public", "epost");
  fs.mkdirSync(mappe, { recursive: true });
  for (const kind of ["smil", "strek", "sur", "ukjent"] as SmileyKind[]) {
    const svg = Buffer.from(smileySvg(kind, STORRELSE));
    await sharp(svg, { density: 300 })
      .resize(STORRELSE, STORRELSE)
      .png({ compressionLevel: 9 })
      .toFile(path.join(mappe, `${kind}.png`));
    console.log(`public/epost/${kind}.png`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
