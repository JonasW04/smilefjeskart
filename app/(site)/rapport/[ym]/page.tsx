import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import KopierKode from "@/components/KopierKode";
import Smiley from "@/components/Smiley";
import { Flis, Seksjon, TallTabell } from "@/components/analyse/Deler";
import { SmileySprite } from "@/components/analyse/SmileySprite";
import StabelRader, { StabelForklaring, type StabelRad } from "@/components/analyse/StabelRader";
import StedRader, { type StedRad } from "@/components/analyse/StedRader";
import { pp, tall } from "@/lib/chart";
import { MIN_KJEDE_12MND, MIN_KOMMUNE_MAANED, MIN_COMEBACK_DAGER, MIN_KOMMUNER_KAARING, maanedNavn, sitatTekst, smilEndringPp, type RapportTilsyn } from "@/lib/rapport";
import { maaneder, rapport, type OmradeRad } from "@/lib/server/rapport";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, formatDato, prosent } from "@/lib/stats";

type Params = { ym: string };

// Én side per ferdig måned, bygget ved deploy. Andre måneder gir 404.
export function generateStaticParams(): Params[] {
  return maaneder().map((ym) => ({ ym }));
}
export const dynamicParams = false;

const stor = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { ym } = await params;
  const r = rapport(ym);
  if (!r) return { title: "Fant ikke rapporten – Smilefjeskartet" };
  const title = `Smilefjes-rapporten ${r.navn}: ${prosent(andel(r.ordinaer, "smil"))} smil | Smilefjeskartet`;
  const description = `${tall(r.ordinaer.total)} ordinære smilefjestilsyn i ${r.navn}: ${tall(r.sur.length)} sure munner, ${tall(r.strek.length)} strekmunner og ${tall(r.comebacks.length)} comebacks. Kommunene og kjedene som gjorde det best og svakest.`;
  return {
    title,
    description,
    alternates: { canonical: r.url },
    openGraph: { title, description, url: r.url, type: "article", locale: "nb_NO", siteName: "Smilefjeskartet" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const SMIL_TEKST = { smil: "smil", strek: "strekmunn", sur: "sur munn" } as const;

function forrigeTekst(r: RapportTilsyn): string | null {
  if (!r.forrige) return "første tilsyn";
  const s = smileFromKarakter(r.forrige.karakter);
  return s ? `${SMIL_TEKST[s]} sist (${formatDato(r.forrige.dato)})` : null;
}

function tilsynRader(liste: RapportTilsyn[], visAnmerkninger: boolean): StedRad[] {
  return liste.map((r) => {
    const s = smileFromKarakter(r.tilsyn.karakter);
    return {
      key: `${r.sted.id}-${r.tilsyn.dato}`,
      slug: r.sted.slug,
      navn: r.sted.navn,
      kind: kindFromKarakter(r.tilsyn.karakter),
      label: s ? SMILE_LABEL[s] : "Ukjent",
      under: [r.sted.kommune ?? r.sted.poststed, visAnmerkninger ? r.anmerkninger.join(", ") : null, forrigeTekst(r)].filter(Boolean).join(" · "),
      meta: formatDato(r.tilsyn.dato).replace(/ \d{4}$/, ""),
    };
  });
}

function stabel(rader: OmradeRad[], sti: "kommune" | "kjede"): StabelRad[] {
  return rader.map(({ omrade, gruppe }) => ({
    key: omrade.id,
    navn: omrade.visningsnavn,
    tekst: omrade.visningsnavn,
    href: `/${sti}/${omrade.slug}`,
    fordeling: gruppe.ordinaer,
    meta: `${tall(gruppe.ordinaer.total)} tilsyn`,
  }));
}

export default async function RapportSide({ params }: { params: Promise<Params> }) {
  const { ym } = await params;
  const r = rapport(ym);
  if (!r) notFound();

  const smil = andel(r.ordinaer, "smil");
  const snitt = andel(r.snitt12, "smil");
  const mndKort = r.navn.split(" ")[0];
  const sitat = sitatTekst(r, r.url);
  const [topp, ...flereComebacks] = r.comebacks;
  const toppFra = topp?.forrige ? smileFromKarakter(topp.forrige.karakter) : null;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Report",
    headline: `Smilefjes-rapporten ${r.navn}`,
    description: sitat,
    url: r.url,
    inLanguage: "nb",
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "Smilefjeskartet", url: "https://smilefjeskartet.no" },
    isBasedOn: "https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9",
  };

  return (
    <article className="space-y-6">
      <SmileySprite />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }} />

      <nav aria-label="Brødsmuler" className="text-sm font-semibold text-ink-soft">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link className="hover:text-ink" href="/rapport">
              Smilefjes-rapporten
            </Link>
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden>›</span>
            <span aria-current="page" className="text-ink">
              {stor(r.navn)}
            </span>
          </li>
        </ol>
      </nav>

      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="pop-in shrink-0 -rotate-6" aria-hidden>
            <Smiley kind={smil >= snitt - 0.02 ? "smil" : "strek"} size={112} />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">📰 Smilefjes-rapporten</p>
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">{stor(r.navn)}</h1>
            <p className="max-w-2xl text-lg text-ink-soft">
              <strong className="text-ink">{prosent(smil)}</strong> av Mattilsynets {tall(r.ordinaer.total)} ordinære tilsyn endte med smil
              {r.fjor ? (
                <>
                  , mot {prosent(andel(r.fjor.ordinaer, "smil"))} i {maanedNavn(r.fjor.ym)}
                </>
              ) : null}
              . {tall(r.sur.length)} tilsyn endte med sur munn.
            </p>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Flis etikett="Ordinære tilsyn" verdi={tall(r.ordinaer.total)} under={`${tall(r.alle)} inkl. oppfølgingstilsyn`} />
        <Flis etikett="Med smil" verdi={prosent(smil)} under={`${pp(smilEndringPp(r.snitt12, r.ordinaer))} mot snittet siste 12 mnd`} />
        <Flis
          etikett={`Mot ${mndKort} i fjor`}
          verdi={r.fjor ? pp(smilEndringPp(r.fjor.ordinaer, r.ordinaer)) : "–"}
          under={r.fjor ? `${maanedNavn(r.fjor.ym)}: ${prosent(andel(r.fjor.ordinaer, "smil"))} smil` : "ingen tall for året før"}
        />
        <Flis etikett="Sur munn" verdi={tall(r.sur.length)} under={`og ${tall(r.strek.length)} strekmunn`} />
      </dl>

      <Seksjon
        id="sitat"
        emoji="🗞️"
        tittel="Til pressen: klart til sitering"
        ingress="Bruk gjerne tallene i saker og innlegg. Oppgi Smilefjeskartet.no som kilde og lenk til rapporten."
      >
        <KopierKode tekst={sitat} etikett="Kopier sitatet" kode={false} />
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-bold">Lenke til rapporten</dt>
            <dd className="break-all text-ink-soft">{r.url}</dd>
          </div>
          <div>
            <dt className="font-bold">Data</dt>
            <dd className="text-ink-soft">
              Mattilsynets åpne tilsynsdata (
              <a className="link" href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer">
                NLOD 2.0
              </a>
              ). Smilefjeskartet er ikke tilknyttet Mattilsynet.
            </dd>
          </div>
          <div>
            <dt className="font-bold">Metode</dt>
            <dd className="text-ink-soft">
              Bare ordinære tilsyn telles. Oppfølgingstilsyn ender nesten alltid med smil og er holdt utenfor. Tallene kan endre seg litt hvis
              Mattilsynet publiserer tilsyn i etterkant.
            </dd>
          </div>
        </dl>
      </Seksjon>

      <div className="grid gap-6 lg:grid-cols-2">
        <Seksjon
          id="sure-munner"
          emoji="😠"
          tittel={`Månedens sure munner (${r.sur.length})`}
          ingress="Ordinære tilsyn med alvorlige brudd på regelverket. Temaene som trakk ned står under navnet."
        >
          {r.sur.length > 0 ? (
            <StedRader rader={tilsynRader(r.sur, true)} />
          ) : (
            <p className="font-semibold">Ingen sur munn i {r.navn}. 🎉</p>
          )}
        </Seksjon>

        <Seksjon id="comeback" emoji="🔄" tittel="Månedens største comeback" ingress={`Fikk strekmunn eller sur munn ved forrige ordinære tilsyn, og smil denne gangen. Nye tilsyn innen ${MIN_COMEBACK_DAGER} dager regnes som oppfølging og teller ikke.`}>
          {topp ? (
            <>
              <a href={`/sted/${topp.sted.slug}`} className="mb-4 flex items-center gap-4 rounded-2xl bg-smil-soft p-4 hover:bg-accent-soft">
                <Smiley kind="smil" size={56} className="shrink-0" />
                <span className="min-w-0">
                  <strong className="block truncate font-display text-xl font-extrabold">{topp.sted.navn}</strong>
                  <span className="block text-sm text-ink-soft">
                    {topp.sted.kommune ?? topp.sted.poststed} · fra {toppFra ? SMIL_TEKST[toppFra] : "anmerkning"} ({formatDato(topp.forrige!.dato)}) til smil (
                    {formatDato(topp.tilsyn.dato)})
                  </span>
                </span>
              </a>
              {flereComebacks.length > 0 && (
                <>
                  <h3 className="mb-2 text-sm font-bold">Flere comebacks ({flereComebacks.length})</h3>
                  <StedRader rader={tilsynRader(flereComebacks.slice(0, 12), false)} />
                  {flereComebacks.length > 12 && <p className="mt-2 text-xs text-ink-soft">… og {flereComebacks.length - 12} til.</p>}
                </>
              )}
            </>
          ) : (
            <p className="font-semibold">Ingen comebacks i {r.navn}.</p>
          )}
        </Seksjon>
      </div>

      <Seksjon
        id="strekmunner"
        emoji="😐"
        tittel={`Strekmunner (${r.strek.length})`}
        ingress="Ordinære tilsyn der regelverket ikke ble fulgt og noe må rettes opp."
      >
        {r.strek.length > 0 ? <StedRader kolonner={2} rader={tilsynRader(r.strek, true)} /> : <p className="font-semibold">Ingen strekmunn i {r.navn}.</p>}
      </Seksjon>

      <Seksjon
        id="kommuner"
        emoji="📍"
        tittel="Kommunene med best og svakest resultat"
        ingress={`Andel smil i ordinære tilsyn i ${r.navn}, blant de ${r.kommuneRader.length} kommunene med minst ${MIN_KOMMUNE_MAANED} ordinære tilsyn i måneden. Kommuner med færre tilsyn er ikke med, så dette er ikke en rangering av alle landets kommuner.`}
      >
        {r.best.length > 0 ? (
          <>
            <StabelForklaring referanseNavn={`Norge i ${mndKort}`} referanse={smil} />
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-display text-lg font-extrabold">🏆 Best</h3>
                <StabelRader referanse={smil} referanseNavn={`Norge i ${mndKort}`} rader={stabel(r.best, "kommune")} />
              </div>
              <div>
                <h3 className="mb-2 font-display text-lg font-extrabold">🧽 Svakest</h3>
                <StabelRader referanse={smil} referanseNavn={`Norge i ${mndKort}`} rader={stabel(r.svakest, "kommune")} />
              </div>
            </div>
            <TallTabell
              tittel={`Kommuner med minst ${MIN_KOMMUNE_MAANED} ordinære tilsyn i ${r.navn}`}
              kolonner={["Kommune", "Ordinære", "Smil", "Strek", "Sur", "Andel smil"]}
              rader={r.kommuneRader.map(({ omrade, gruppe }) => [
                <Link key={omrade.id} className="link" href={`/kommune/${omrade.slug}`}>
                  {omrade.visningsnavn}
                </Link>,
                tall(gruppe.ordinaer.total),
                String(gruppe.ordinaer.smil),
                String(gruppe.ordinaer.strek),
                String(gruppe.ordinaer.sur),
                prosent(andel(gruppe.ordinaer, "smil"), 1),
              ])}
            />
          </>
        ) : r.kommuneRader.length > 0 ? (
          <>
            <p className="mb-3 font-semibold">
              Bare {r.kommuneRader.length} {r.kommuneRader.length === 1 ? "kommune" : "kommuner"} hadde minst {MIN_KOMMUNE_MAANED} ordinære tilsyn i{" "}
              {r.navn}. Med færre enn {MIN_KOMMUNER_KAARING} kårer vi ingen best eller svakest, men her er tallene:
            </p>
            <StabelForklaring referanseNavn={`Norge i ${mndKort}`} referanse={smil} />
            <StabelRader referanse={smil} referanseNavn={`Norge i ${mndKort}`} rader={stabel(r.kommuneRader, "kommune")} />
          </>
        ) : (
          <p className="font-semibold">Ingen kommuner hadde {MIN_KOMMUNE_MAANED} eller flere ordinære tilsyn i {r.navn}.</p>
        )}
      </Seksjon>

      <Seksjon
        id="kjeder"
        emoji="🔗"
        tittel="Kjede-rangeringen"
        ingress={`Andel smil i ordinære tilsyn fra ${maanedNavn(r.fra12)} til ${r.navn}. En enkelt måned har for få kjedetilsyn til en rettferdig rangering, så her teller tolv måneder. Kjeder med minst ${MIN_KJEDE_12MND} ordinære tilsyn i perioden er med.`}
      >
        {r.kjedeRader.length > 0 ? (
          <>
            <StabelForklaring referanseNavn="Norge siste 12 mnd" referanse={snitt} />
            <StabelRader referanse={snitt} referanseNavn="Norge siste 12 mnd" rader={stabel(r.kjedeRader, "kjede")} />
          </>
        ) : (
          <p className="font-semibold">Ingen kjeder hadde {MIN_KJEDE_12MND} ordinære tilsyn i perioden.</p>
        )}
      </Seksjon>

      <nav aria-label="Andre måneder" className="flex flex-wrap items-center justify-between gap-3">
        {r.forrige ? (
          <Link className="btn" href={`/rapport/${r.forrige}`}>
            ← {stor(maanedNavn(r.forrige))}
          </Link>
        ) : (
          <span />
        )}
        <Link className="link font-semibold" href="/rapport">
          Alle rapportene
        </Link>
        {r.neste ? (
          <Link className="btn" href={`/rapport/${r.neste}`}>
            {stor(maanedNavn(r.neste))} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <p className="text-sm text-ink-soft">
        Vil du vise tallene for din kommune på nettsiden din? Hver{" "}
        <Link className="link" href="/kommune">
          kommuneside
        </Link>{" "}
        har en widget du kan bygge inn.
      </p>
    </article>
  );
}
