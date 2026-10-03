import type { Metadata } from "next";
import StatusKort, { type StatusInnhold } from "@/components/varsling/StatusKort";

export const metadata: Metadata = {
  title: "Avmeldt | Smilefjeskartet",
  robots: { index: false, follow: false },
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

export default async function AvmeldtSide({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { status } = await searchParams;
  const innhold = typeof status === "string" && Object.hasOwn(INNHOLD, status) ? INNHOLD[status] : INNHOLD.ugyldig;
  return <StatusKort innhold={innhold} />;
}
