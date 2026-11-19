"use client";

import { useEffect, useState } from "react";
import { kopier } from "./deling";

type Props = { tekst: string; etikett: string; className?: string };

/** Kopierer tekst med ett trykk og bekrefter med en hake i knappen. */
export default function KopierKnapp({ tekst, etikett, className = "" }: Props) {
  const [status, setStatus] = useState<"klar" | "kopiert" | "feil">("klar");

  useEffect(() => {
    if (status === "klar") return;
    const t = setTimeout(() => setStatus("klar"), 2000);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <button type="button" className={`btn text-sm ${className}`} onClick={async () => setStatus((await kopier(tekst)) ? "kopiert" : "feil")}>
      <span aria-live="polite">{status === "kopiert" ? "✅ Kopiert!" : status === "feil" ? "😬 Marker og kopier selv" : etikett}</span>
    </button>
  );
}
