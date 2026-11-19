"use client";

import { useEffect, useState } from "react";
import { del, type DelUtfall } from "./deling";

type Props = {
  etikett: React.ReactNode;
  tittel: string;
  url: string;
  /** Tekst i delingsarket. */
  tekst?: string;
  /** Kopier teksten med lenken bak, ikke bare lenken, når det ikke finnes noe delingsark. */
  kopierTekst?: boolean;
  className?: string;
};

/** Deler en lenke via delingsarket på mobil, eller kopierer den på PC og bekrefter i knappen. */
export default function DelKnapp({ etikett, tittel, url, tekst, kopierTekst = false, className = "btn" }: Props) {
  const [utfall, setUtfall] = useState<DelUtfall | null>(null);

  useEffect(() => {
    if (utfall !== "kopiert" && utfall !== "feil") return;
    const t = setTimeout(() => setUtfall(null), 2000);
    return () => clearTimeout(t);
  }, [utfall]);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const lenke = new URL(url, window.location.origin).toString();
        setUtfall(await del({ title: tittel, text: tekst, url: lenke }, kopierTekst && tekst ? `${tekst} ${lenke}` : lenke));
      }}
    >
      <span aria-live="polite">{utfall === "kopiert" ? "✅ Kopiert!" : utfall === "feil" ? "😬 Kunne ikke kopiere" : etikett}</span>
    </button>
  );
}
