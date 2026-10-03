"use client";

import Link from "next/link";
import Smiley from "@/components/Smiley";

export default function Feil({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="site">
      <main id="innhold" className="mx-auto w-full max-w-xl flex-1 px-4 py-16 text-center">
        <div className="pop-in inline-block rotate-6">
          <Smiley kind="sur" size={120} />
        </div>
        <h1 className="mt-4 font-display text-4xl font-extrabold">Oi, noe gikk galt</h1>
        <p className="mt-2 text-ink-soft">Det er vår feil, ikke kjøkkenets. Prøv igjen om litt.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">🔄 Prøv igjen</button>
          <Link href="/" className="btn">🗺️ Til kartet</Link>
        </div>
      </main>
    </div>
  );
}
