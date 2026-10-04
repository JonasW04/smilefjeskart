import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import { Flis, Seksjon } from "@/components/analyse/Deler";
import { SmileySprite } from "@/components/analyse/SmileySprite";
import StedRader, { type StedRad } from "@/components/analyse/StedRader";
import { tall, UKEDAGER } from "@/lib/chart";
import { getSteder } from "@/lib/server/data";
import { sluttDato } from "@/lib/server/omrader";
import { FERSK_DAGER, ferskeTilsyn, kontekst, type FerskTilsyn, type FerskType } from "@/lib/siste";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { formatDato, prosent } from "@/lib/stats";

const SITE = "https://smilefjeskartet.no";

export const metadata: Metadata = {
  title: "Ferskt fra Mattilsynet – siste smilefjestilsyn | Smilefjeskartet",
  description: `Alle smilefjestilsyn de siste ${FERSK_DAGER} dagene: nye sure munner, strekmunner, comebacks og nye steder. Med RSS-strøm.`,
  alternates: {
    canonical: `${SITE}/siste`,
    types: { "application/rss+xml": [{ url: "/siste/rss.xml", title: "Ferskt fra Mattilsynet" }] },
  },
  openGraph: {
    title: "Ferskt fra Mattilsynet | Smilefjeskartet",
    description: `Nye sure munner, comebacks og nye steder – alle smilefjestilsyn de siste ${FERSK_DAGER} dagene.`,
    url: `${SITE}/siste`,
    type: "website",
    locale: "nb_NO",
    siteName: "Smilefjeskartet",
  },
};

function ukedag(iso: string): string {
  return UKEDAGER[(new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7];
}

function rader(liste: FerskTilsyn[], visDato = true): StedRad[] {
  return liste.map((f, i) => {
    const s = smileFromKarakter(f.tilsyn.karakter);
    const ekstra = f.type === "sur" || f.type === "strek" ? f.anmerkninger.join(", ") : null;
    return {
      key: `${f.sted.id}-${f.tilsyn.dato}-${i}`,
      slug: f.sted.slug,
      navn: f.sted.navn,
      kind: kindFromKarakter(f.tilsyn.karakter),
      label: s ? SMILE_LABEL[s] : "Ukjent",
      under: [f.sted.kommune ?? f.sted.poststed, kontekst(f), ekstra, f.tilsyn.oppfolging ? "oppfølging" : null].filter(Boolean).join(" · "),
      meta: visDato ? formatDato(f.tilsyn.dato).replace(/ \d{4}$/, "") : undefined,
    };
  });
}

const HISTORIER: Array<{ type: FerskType; id: string; emoji: string; tittel: string; ingress: string; tom: string }> = [
  {
    type: "sur",
    id: "sur",
    emoji: "😠",
    tittel: "Sur munn",
    ingress: "Alvorlige brudd på regelverket. Mattilsynet kommer tilbake for å sjekke at det er rettet opp.",
    tom: "Ingen sur munn i perioden. Kjøkken-Norge oppfører seg! 🎉",
  },
  {
    type: "comeback",
    id: "comebacks",
    emoji: "🔄",
    tittel: "Comebacks",
    ingress: "Hadde strekmunn eller sur munn forrige gang – nå er det smil.",
    tom: "Ingen comebacks i perioden.",
  },
  {
    type: "strek",
    id: "strek",
    emoji: "😐",
    tittel: "Strekmunn",
    ingress: "Regelverket ble ikke fulgt, og det må rettes opp. Temaene som trakk ned står under navnet.",
    tom: "Ingen strekmunn i perioden.",
  },
  {
    type: "ny",
    id: "nye",
    emoji: "🐣",
    tittel: "Nye på kartet",
    ingress: "Første tilsyn noensinne – og rett inn med smil.",
    tom: "Ingen nye steder i perioden.",
  },
];

export default function SisteSide() {
  const slutt = sluttDato();
  const fra = new Date(Date.parse(slutt) - (FERSK_DAGER - 1) * 86_400_000).toISOString().slice(0, 10);
  const alle = ferskeTilsyn(getSteder(), slutt);
  const antall = (t: FerskType) => alle.filter((f) => f.type === t).length;
  const medSmil = alle.filter((f) => smileFromKarakter(f.tilsyn.karakter) === "smil").length;
  const medResultat = alle.filter((f) => smileFromKarakter(f.tilsyn.karakter) !== null).length;

  const perDag = new Map<string, FerskTilsyn[]>();
  for (const f of alle) {
    const dag = perDag.get(f.tilsyn.dato) ?? [];
    dag.push(f);
    perDag.set(f.tilsyn.dato, dag);
  }

  return (
    <article className="space-y-8">
      <SmileySprite />

      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              {formatDato(fra)} – {formatDato(slutt)}
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Ferskt fra Mattilsynet</h1>
            <p className="text-lg text-ink-soft">
              Rykende ferske smilefjes: alle tilsyn de siste {FERSK_DAGER} dagene, med de sure munnene, comebackene og nykommerne først.
              Mattilsynet publiserer med noen dagers forsinkelse, og siden oppdateres hver morgen.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a className="btn" href="/siste/rss.xml">
                <span aria-hidden>📡</span> Abonner med RSS
              </a>
              <Link className="btn" href="/varsling">
                <span aria-hidden>🔔</span> Få e-postvarsler
              </Link>
            </div>
          </div>
          <div className="order-first flex shrink-0 items-end gap-1 self-start lg:order-none lg:self-center" aria-hidden>
            <span className="pop-in -rotate-6 text-6xl max-lg:text-5xl">🥐</span>
            <span className="pop-in rotate-12" style={{ animationDelay: "90ms" }}>
              <Smiley kind="smil" size={80} className="max-lg:h-14 max-lg:w-14" />
            </span>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Flis etikett="Tilsyn" verdi={tall(alle.length)} under={`på ${perDag.size} dager`} />
        <Flis etikett="Med smil" verdi={medResultat ? prosent(medSmil / medResultat) : "–"} under={`${tall(medSmil)} av ${tall(medResultat)}, inkl. oppfølging`} />
        <Flis etikett="Sur munn" verdi={tall(antall("sur"))} under={`og ${tall(antall("strek"))} strekmunn`} />
        <Flis etikett="Comebacks" verdi={tall(antall("comeback"))} under={`og ${tall(antall("ny"))} nye steder`} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        {HISTORIER.map((h) => {
          const liste = alle.filter((f) => f.type === h.type);
          return (
            <Seksjon key={h.id} id={h.id} emoji={h.emoji} tittel={`${h.tittel} (${liste.length})`} ingress={h.ingress}>
              {liste.length > 0 ? <StedRader rader={rader(liste)} /> : <p className="font-semibold">{h.tom}</p>}
            </Seksjon>
          );
        })}
      </div>

      <Seksjon id="dag-for-dag" emoji="🗓️" tittel="Dag for dag" ingress="Alle tilsyn i perioden, nyeste først.">
        <div className="space-y-6">
          {[...perDag].map(([dato, liste]) => (
            <section key={dato} aria-labelledby={`dag-${dato}`}>
              <h3 id={`dag-${dato}`} className="mb-1 font-display text-lg font-extrabold first-letter:uppercase">
                {ukedag(dato)} {formatDato(dato)}{" "}
                <span className="text-sm font-semibold text-ink-soft">· {liste.length} tilsyn</span>
              </h3>
              <StedRader kolonner={2} rader={rader(liste, false)} />
            </section>
          ))}
        </div>
      </Seksjon>
    </article>
  );
}
