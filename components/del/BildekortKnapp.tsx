"use client";

import { useRef, useState } from "react";
import { kanDeleNativt } from "./deling";

type Props = { slug: string; navn: string; className?: string };

type Status = "klar" | "laster" | "trykkIgjen" | "feil";

const ETIKETT: Record<Status, string> = {
  klar: "Bildekort",
  laster: "Lager bildet …",
  trykkIgjen: "Bildet er klart – trykk for å dele",
  feil: "Fikk ikke laget bildet",
};

/**
 * Bildekort i story-format. På mobil deles selve bildet, så det kan legges rett i Snapchat, Instagram eller
 * Messenger. Ellers lastes det ned.
 */
export default function BildekortKnapp({ slug, navn, className = "btn" }: Props) {
  const [status, setStatus] = useState<Status>("klar");
  const fil = useRef<File | null>(null);
  const src = `/sted/${encodeURIComponent(slug)}/kort.png`;
  const filnavn = `smilefjes-${slug}.png`;

  async function del(f: File) {
    const data: ShareData = { files: [f], title: `Smilefjes for ${navn}` };
    if (!kanDeleNativt(data)) {
      lastNed(f, filnavn);
      setStatus("klar");
      return;
    }
    try {
      await navigator.share(data);
      setStatus("klar");
    } catch (e) {
      const feil = e instanceof DOMException ? e.name : "";
      if (feil === "AbortError") setStatus("klar");
      // Tok hentingen for lang tid, har nettleseren glemt trykket. Bildet er hentet, så neste trykk deler med en gang.
      else if (feil === "NotAllowedError") setStatus("trykkIgjen");
      else {
        lastNed(f, filnavn);
        setStatus("klar");
      }
    }
  }

  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Uten delingsark med filer gjør lenken jobben selv (download-attributtet).
    if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return;
    e.preventDefault();
    if (status === "laster") return;
    if (fil.current) return del(fil.current);
    setStatus("laster");
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      fil.current = new File([await res.blob()], filnavn, { type: "image/png" });
    } catch {
      setStatus("feil");
      return;
    }
    await del(fil.current);
  }

  return (
    <a href={src} download={filnavn} onClick={onClick} className={className} aria-busy={status === "laster" || undefined}>
      <span aria-hidden>📸</span> <span aria-live="polite">{ETIKETT[status]}</span>
    </a>
  );
}

function lastNed(blob: Blob, filnavn: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filnavn;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
