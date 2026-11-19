import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import { endringPp } from "@/lib/analyse";
import { KATEGORI_EMOJI } from "@/lib/classify";
import { pp, tall } from "@/lib/chart";
import { kartLenke } from "@/lib/kart";
import { KATEGORI_TEKST, lokalStats, postnrTekst, utsnitt, type LokaltTilsyn } from "@/lib/lokal";
import { getDatasett, landFordeling } from "@/lib/server/data";
import { lokalPlassering, lokaleSiderFor, lokalUrlSti, type LokalSide as Side } from "@/lib/server/lokal";
import { getOmrade, sluttDato } from "@/lib/server/omrader";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, formatDato, fordeling, ordinaereKarakterer, prosent, sisteTilsyn } from "@/lib/stats";
import { Flis, Seksjon } from "./Deler";
import { SITE } from "./OmradeSide";
import { SmileySprite } from "./SmileySprite";
import LenkeChips from "./LenkeChips";
import SorterbarStedListe from "./SorterbarStedListe";
import StabelRader, { StabelForklaring } from "./StabelRader";
import StedRader from "./StedRader";

/** Tekstbiter som skiller kategori- og strøksider. */
function tekster(side: Side) {
  const k = side.kommune.navn;
  if (side.kategori) {
    const t = KATEGORI_TEKST[side.kategori];
    return {
      h1: `${t.tittel} i ${k}`,
      /** «sushistedene i Oslo» */
      bestemt: `${t.bestemt} i ${k}`,
      ubestemt: t.ubestemt,
      emoji: KATEGORI_EMOJI[side.kategori],
      tittel: `${t.tittel} i ${k}: smilefjes for ${tall(side.steder.length)} ${t.ubestemt}`,
      flertall: "kategorier",
    };
  }
  const iNavn = side.strok!.iNavn;
  return {
    h1: side.navn,
    bestemt: `stedene ${iNavn}`,
    ubestemt: "serveringssteder",
    emoji: "🏘️",
    tittel: `Spisesteder ${iNavn} i ${k}: smilefjes og tilsyn`,
    flertall: "strøk",
  };
}

export function lokalUrl(side: Side): string {
  return `${SITE}${lokalUrlSti(side)}`;
}

export function lokalMetadata(side: Side | null): Metadata {
  if (!side) return { title: "Fant ikke siden – Smilefjeskartet" };
  const t = tekster(side);
  const smil = prosent(andel(side.ordinaer, "smil"));
  const kommuneSmil = prosent(andel(side.kommune.ordinaer, "smil"));
  const title = `${t.tittel} | Smilefjeskartet`;
  const description = `${tall(side.steder.length)} ${t.ubestemt}${side.strok ? ` ${side.strok.iNavn}` : ` i ${side.kommune.navn}`} og ${tall(side.tilsyn)} tilsyn fra Mattilsynet. ${smil} av de ordinære tilsynene endte med smil, mot ${kommuneSmil} i hele ${side.kommune.navn}. Se de siste anmerkningene og alle stedene.`;
  const url = lokalUrl(side);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function sammenlignOrd(a: number, b: number): string {
  if (Math.abs(a - b) < 0.005) return "omtrent som";
  return a > b ? "bedre enn" : "svakere enn";
}

export default function LokalSide({ side }: { side: Side }) {
  const t = tekster(side);
  const k = side.kommune;
  const land = landFordeling();
  const smil = andel(side.ordinaer, "smil");
  const kommuneSmil = andel(k.ordinaer, "smil");
  const slutt = sluttDato();
  const stats = lokalStats(side.steder, slutt);
  const plass = lokalPlassering(side);
  const fylke = k.fylkeSlug ? getOmrade("fylke", k.fylkeSlug) : null;
  const iDag = getDatasett().generert.slice(0, 10);
  const anmerkningerAar = stats.sisteAar.strek + stats.sisteAar.sur;

  const smuler: Array<{ navn: string; href?: string }> = [{ navn: "Analyse", href: "/analyse" }];
  if (fylke && fylke.navn !== k.navn) smuler.push({ navn: fylke.navn, href: `/fylke/${fylke.slug}` });
  smuler.push({ navn: k.navn, href: `/kommune/${k.slug}` });
  smuler.push({ navn: side.navn });

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: smuler.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.navn,
      item: s.href ? `${SITE}${s.href}` : lokalUrl(side),
    })),
  };

  const sosken = lokaleSiderFor(side.kommunenr, side.type).sort(
    (a, b) => andel(b.ordinaer, "smil") - andel(a.ordinaer, "smil") || b.ordinaer.total - a.ordinaer.total,
  );
  const andreType = lokaleSiderFor(side.kommunenr, side.type === "kategori" ? "strok" : "kategori");

  const rader = side.steder.map((s) => {
    const siste = sisteTilsyn(s);
    const f = fordeling(ordinaereKarakterer(s));
    const smile = smileFromKarakter(siste.karakter);
    return {
      slug: s.slug,
      navn: s.navn,
      kind: kindFromKarakter(siste.karakter),
      label: smile ? SMILE_LABEL[smile] : "Ukjent",
      under: s.adresse || s.poststed,
      siste: siste.dato,
      smil: f.smil,
      total: f.total,
    };
  });

  const kart = kartLenke(utsnitt(side.steder), side.kategori ?? undefined);

  return (
    <article className="space-y-6">
      <SmileySprite />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c") }} />

      <nav aria-label="Brødsmuler" className="text-sm font-semibold text-ink-soft">
        <ol className="flex flex-wrap items-center gap-1.5">
          {smuler.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>›</span>}
              {s.href ? (
                <Link className="hover:text-ink" href={s.href}>
                  {s.navn}
                </Link>
              ) : (
                <span aria-current="page" className="text-ink">
                  {s.navn}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="pop-in shrink-0 -rotate-6" aria-hidden>
            <Smiley kind={smil >= kommuneSmil - 0.02 ? "smil" : "strek"} size={112} />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              {t.emoji} {side.type === "kategori" ? "Kategori" : "Strøk"} i {k.navn}
            </p>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{t.h1}</h1>
            <p className="text-lg text-ink-soft">
              <strong className="text-ink">{prosent(smil)}</strong> av de ordinære tilsynene hos {t.bestemt} har endt med smil –{" "}
              {sammenlignOrd(smil, kommuneSmil)} snittet for hele {k.navn} på {prosent(kommuneSmil)}.
            </p>
            <Link href={kart} className="btn btn-primary mt-2">
              🗺️ Se dem på kartet
            </Link>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Flis etikett="Steder" verdi={tall(side.steder.length)} under="med tilsyn siden 2016" />
        <Flis etikett="Ordinære tilsyn" verdi={tall(side.ordinaer.total)} under={`${tall(side.tilsyn)} tilsyn i alt`} />
        <Flis etikett="Ordinære med smil" verdi={prosent(smil)} under={`${pp(endringPp(kommuneSmil, smil))} mot ${k.navn}`} />
        <Flis
          etikett="Siste 12 mnd."
          verdi={tall(anmerkningerAar)}
          under={`strek eller sur av ${tall(stats.sisteAar.total)} ordinære`}
        />
      </dl>

      <Seksjon id="kort-fortalt" emoji="📝" tittel="Kort fortalt">
        <div className="max-w-prose space-y-3">
          <p>
            Mattilsynet har vært på {tall(side.tilsyn)} tilsyn hos {t.bestemt} siden 2016. {tall(side.ordinaer.total)} av dem var ordinære
            tilsyn, og {prosent(smil)} av disse endte med smil, {tall(side.ordinaer.strek)} med strekmunn og {tall(side.ordinaer.sur)} med
            sur munn. For alle serveringssteder i {k.navn} er andelen smil {prosent(kommuneSmil)}, og for hele Norge{" "}
            {prosent(andel(land, "smil"))}.
          </p>
          {plass.av >= 2 && (
            <p>
              Rangert etter andel smil er det plass {plass.plass} av {plass.av} {t.flertall} i {k.navn} som har egen side her.
            </p>
          )}
          <p>
            {stats.sisteAar.total === 0
              ? "Det har ikke vært noen ordinære tilsyn her de siste 12 månedene."
              : anmerkningerAar === 0
                ? `Alle de ${tall(stats.sisteAar.total)} ordinære tilsynene de siste 12 månedene endte med smil. 🎉`
                : `De siste 12 månedene har Mattilsynet gjort ${tall(stats.sisteAar.total)} ordinære tilsyn her, og ${tall(anmerkningerAar)} av dem endte med strekmunn eller sur munn.`}
          </p>
        </div>
      </Seksjon>

      <div className="grid gap-6 lg:grid-cols-2">
        <Seksjon
          id="anmerkninger"
          emoji="🚨"
          tittel="Siste anmerkninger"
          ingress="Ordinære tilsyn med strekmunn eller sur munn de siste 12 månedene, sur munn først. Fjeset viser resultatet av akkurat det tilsynet."
        >
          {stats.verste.length > 0 ? (
            <TilsynListe liste={stats.verste} />
          ) : (
            <p className="text-sm">🎉 Ingen strekmunn eller sur munn her de siste 12 månedene.</p>
          )}
        </Seksjon>
        <Seksjon
          id="rene"
          emoji="✨"
          tittel="Helt rene tilsyn"
          ingress="Siste ordinære tilsyn uten ett eneste avvik (karakter 0), de siste 12 månedene."
        >
          {stats.beste.length > 0 ? (
            <TilsynListe liste={stats.beste} />
          ) : (
            <p className="text-sm">Ingen helt feilfrie ordinære tilsyn her de siste 12 månedene.</p>
          )}
        </Seksjon>
      </div>

      <Seksjon
        id="sammenlign"
        emoji="⚖️"
        tittel={side.type === "kategori" ? `Kategoriene i ${k.navn}` : `Strøkene i ${k.navn}`}
        ingress={`Utfall av ordinære tilsyn siden 2016, sortert etter andel smil. Den loddrette streken er snittet for hele ${k.navn}.`}
      >
        <StabelForklaring referanse={kommuneSmil} referanseNavn={k.navn} />
        <StabelRader
          referanse={kommuneSmil}
          referanseNavn={k.navn}
          rader={sosken.map((s) => ({
            key: s.slug,
            navn: s.navn,
            tekst: s.navn,
            href: s.slug === side.slug ? undefined : lokalUrlSti(s),
            fordeling: s.ordinaer,
            uthevet: s.slug === side.slug,
            meta: `${tall(s.steder.length)} steder`,
          }))}
        />
      </Seksjon>

      <Seksjon
        id="steder"
        emoji="🍽️"
        tittel={`Alle ${tall(side.steder.length)} steder`}
        ingress="Fjeset viser siste tilsyn. Sorter etter andel smil for å se hvem som oftest har fått strekmunn eller sur munn i ordinære tilsyn."
      >
        <SorterbarStedListe rader={rader} />
      </Seksjon>

      {andreType.length > 0 && (
        <Seksjon id="mer" emoji="🧭" tittel={side.type === "kategori" ? `Strøk i ${k.navn}` : `Kategorier i ${k.navn}`}>
          <LenkeChips sider={andreType} />
        </Seksjon>
      )}

      <p className="text-sm text-ink-soft">
        Tall fra Mattilsynets åpne tilsynsdata, oppdatert {formatDato(iDag)}.{" "}
        {side.strok
          ? `Strøket er avgrenset med postnumrene ${postnrTekst(side.strok.postnr)} og følger ikke nøyaktig de offisielle bydelsgrensene.`
          : "Kategorien gjettes ut fra stedsnavnet og kan ta feil for enkeltsteder."}{" "}
        <Link className="link" href={`/kommune/${k.slug}`}>
          Se hele {k.navn}
        </Link>
      </p>
    </article>
  );
}

function TilsynListe({ liste }: { liste: LokaltTilsyn[] }) {
  return (
    <StedRader
      rader={liste.map(({ sted, tilsyn }) => {
        const smile = smileFromKarakter(tilsyn.karakter);
        return {
          key: `${sted.id}-${tilsyn.dato}`,
          slug: sted.slug,
          navn: sted.navn,
          kind: kindFromKarakter(tilsyn.karakter),
          label: smile ? SMILE_LABEL[smile] : "Ukjent",
          under: sted.adresse || sted.poststed,
          meta: formatDato(tilsyn.dato),
        };
      })}
    />
  );
}
