import type { Metadata } from "next";
import StatusKort, { type StatusInnhold } from "@/components/varsling/StatusKort";

export const metadata: Metadata = {
  title: "Varsling bekreftet | Smilefjeskartet",
  robots: { index: false, follow: false },
};

const INNHOLD: Record<string, StatusInnhold> = {
  ok: {
    kind: "smil",
    tittel: "Varselet er på! 🎉",
    tekst:
      "Nå holder vi utkikk for deg. Neste gang Mattilsynet har vært på besøk i området ditt, får du en e-post. Hver e-post har en lenke for å melde seg av.",
    bg: "bg-smil-soft",
  },
  utlopt: {
    kind: "strek",
    tittel: "Lenken er gått ut ⏰",
    tekst: "Bekreftelseslenker virker i 48 timer, og denne er for gammel. Ingen fare – bare meld deg på igjen.",
    bg: "bg-strek-soft",
    lenke: { href: "/varsling", tekst: "📬 Prøv igjen" },
  },
  ugyldig: {
    kind: "sur",
    tittel: "Hmm, den lenken kjenner vi ikke",
    tekst: "Lenken ser ut til å være ødelagt eller ufullstendig. Prøv å kopiere hele lenken fra e-posten, eller meld deg på på nytt.",
    bg: "bg-sur-soft",
    lenke: { href: "/varsling", tekst: "📬 Meld meg på" },
  },
  feil: {
    kind: "ukjent",
    tittel: "Noe gikk galt hos oss",
    tekst: "Vi klarte ikke å bekrefte akkurat nå. Prøv lenken igjen om litt – den virker i 48 timer.",
    bg: "bg-ukjent-soft",
  },
};

export default async function BekreftetSide({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  const { status } = await searchParams;
  const innhold = typeof status === "string" && Object.hasOwn(INNHOLD, status) ? INNHOLD[status] : INNHOLD.ugyldig;
  return <StatusKort innhold={innhold} />;
}
