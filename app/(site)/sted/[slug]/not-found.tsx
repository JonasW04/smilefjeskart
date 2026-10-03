import Link from "next/link";
import Smiley from "@/components/Smiley";

export default function StedIkkeFunnet() {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <div className="pop-in inline-block rotate-6">
        <Smiley kind="ukjent" size={110} />
      </div>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Hmm, fant ikke stedet</h1>
      <p className="mt-2 text-ink-soft">
        Kanskje det har byttet navn, eller ikke er med i Mattilsynets data lenger. Prøv å søke på kartet!
      </p>
      <Link href="/" className="btn btn-primary mt-6">🗺️ Til kartet</Link>
    </div>
  );
}
