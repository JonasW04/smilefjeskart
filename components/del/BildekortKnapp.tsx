"use client";

import { useState } from "react";
import { kanDeleNativt } from "./deling";

type Props = { slug: string; navn: string; className?: string };

/**
 * Bildekort i story-format. På mobil deles selve bildet, så det kan legges rett i Snapchat, Instagram eller
 * Messenger. Ellers lastes det ned.
 */
export default function BildekortKnapp({ slug, navn, className = "btn" }: Props) {
  const [laster, setLaster] = useState(false);
  const src = `/sted/${encodeURIComponent(slug)}/kort.png`;
  const filnavn = `smilefjes-${slug}.png`;

  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return;
    e.preventDefault();
    setLaster(true);
    try {
      const blob = await fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const fil = new File([blob], filnavn, { type: "image/png" });
      const data: ShareData = { files: [fil], title: `Smilefjes for ${navn}` };
      if (kanDeleNativt(data)) {
        await navigator.share(data).catch(() => {});
      } else {
        lastNed(URL.createObjectURL(blob), filnavn, true);
      }
    } catch {
      lastNed(src, filnavn, false);
    } finally {
      setLaster(false);
    }
  }

  return (
    <a href={src} download={filnavn} onClick={onClick} className={className} aria-busy={laster || undefined}>
      <span aria-hidden>📸</span> {laster ? "Lager bildet …" : "Bildekort"}
    </a>
  );
}

function lastNed(href: string, filnavn: string, frigi: boolean) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filnavn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (frigi) setTimeout(() => URL.revokeObjectURL(href), 1000);
}
