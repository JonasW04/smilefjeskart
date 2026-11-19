"use client";

import { useState } from "react";

/** Tekst eller kode i en boks med kopier-knapp. Teksten kan også markeres og kopieres for hånd. */
export default function KopierKode({ tekst, etikett = "Kopier", kode = true }: { tekst: string; etikett?: string; kode?: boolean }) {
  const [kopiert, setKopiert] = useState(false);

  async function kopier() {
    try {
      await navigator.clipboard.writeText(tekst);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1800);
    } catch {
      // Utklippstavlen kan være blokkert; teksten står fortsatt klar til å markeres.
    }
  }

  return (
    <div className="space-y-2">
      {kode ? (
        <pre className="select-all overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-paper p-3 text-xs">
          <code>{tekst}</code>
        </pre>
      ) : (
        <p className="select-all rounded-xl bg-paper p-3 text-sm">{tekst}</p>
      )}
      <button type="button" className="btn text-sm" onClick={kopier}>
        <span aria-hidden>{kopiert ? "✅" : "📋"}</span>
        <span aria-live="polite">{kopiert ? "Kopiert!" : etikett}</span>
      </button>
    </div>
  );
}
