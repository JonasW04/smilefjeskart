import type { Metadata } from "next";
import StatusKort, { type StatusInnhold } from "@/components/varsling/StatusKort";
import Link from "next/link";
import Smiley from "@/components/Smiley";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Avmeldt | Smilefjeskartet",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const INNHOLD: Record<string, StatusInnhold> = {
  ok: {
    kind: "strek",
    tittel: "Du er meldt av 👋",
    tekst:
      "Vi har slettet abonnementet og e-postadressen din. Du får ingen flere varsler fra oss. Ombestemmer du deg, er det bare å melde seg på igjen.",
    bg: "bg-paper-2",
    lenke: { href: "/varsling", tekst: "📬 Meld meg på igjen" },
  },
  ugyldig: {
    kind: "sur",
    tittel: "Hmm, den lenken virker ikke",
    tekst:
      "Lenken ser ut til å være ødelagt eller ufullstendig. Prøv å kopiere hele lenken fra e-posten, eller bruk «Avslutt abonnement»-knappen i e-postprogrammet ditt.",
    bg: "bg-sur-soft",
  },
  feil: {
    kind: "ukjent",
    tittel: "Noe gikk galt hos oss",
    tekst: "Vi klarte ikke å melde deg av akkurat nå. Prøv lenken igjen om litt.",
    bg: "bg-ukjent-soft",
  },
};

export default async function AvmeldtSide({ searchParams }: { searchParams: Promise<{ status?: string | string[]; token?: string | string[] }> }) {
  const { status, token } = await searchParams;
  if (status === "bekreft" && typeof token === "string" && token.length <= 512) {
    return (
      <div className="mx-auto max-w-xl py-4 sm:py-10">
        <section className="card bg-paper-2 p-6 text-center sm:p-10" aria-labelledby="avmeld-tittel">
          <div className="mx-auto mb-4 w-fit"><Smiley kind="strek" size={104} /></div>
          <h1 id="avmeld-tittel" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Vil du melde deg av?</h1>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">Trykk på knappen for å avslutte varselet og slette abonnementet og e-postadressen din.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <form method="post" action={`/api/varsling/avmeld?token=${encodeURIComponent(token)}&manuell=1`}>
              <button type="submit" className="btn btn-primary">Meld meg av</button>
            </form>
            <Link href="/" className="btn">🗺️ Til kartet</Link>
          </div>
        </section>
      </div>
    );
  }
  const innhold = typeof status === "string" && Object.hasOwn(INNHOLD, status) ? INNHOLD[status] : INNHOLD.ugyldig;
  return <StatusKort innhold={innhold} />;
}
