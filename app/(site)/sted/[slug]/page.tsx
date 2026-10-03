import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FordelingBar from "@/components/FordelingBar";
import Smiley from "@/components/Smiley";
import Tidslinje from "@/components/sted/Tidslinje";
import { KATEGORI_EMOJI, KATEGORI_NAVN } from "@/lib/classify";
import { getDatasett, getSted, kjedeFordeling, kjedeSteder, kommuneFordeling, landFordeling, naermeste } from "@/lib/server/data";
import { KARAKTER_FORKLARING, SMILE_LABEL, TEMAER, isGraded, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, dagerMellom, fordeling, formatDato, ordinaereKarakterer, prosent, sisteTilsyn, stedStats, tidSiden } from "@/lib/stats";
import type { Sted } from "@/lib/types";

type Params = { slug: string };

// Sidene lages ved første besøk og caches til neste deploy (data oppdateres daglig via deploy).
export function generateStaticParams(): Params[] {
  return [];
}

const SITE = "https://smilefjeskartet.no";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const s = getSted(slug);
  if (!s) return { title: "Fant ikke stedet – Smilefjeskartet" };
  const t = sisteTilsyn(s);
  const smil = smileFromKarakter(t.karakter);
  const title = `${s.navn}, ${s.poststed || s.kommune || ""} – ${smil ? SMILE_LABEL[smil] : "Smilefjes"} | Smilefjeskartet`;
  const description = `${s.navn} fikk ${smil ? SMILE_LABEL[smil].toLowerCase() : "ukjent karakter"} ved siste tilsyn ${formatDato(t.dato)}. Se alle ${s.tilsyn.length} tilsyn fra Mattilsynet siden ${s.tilsyn[0].dato.slice(0, 4)}, tema for tema.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE}/sted/${s.slug}` },
    openGraph: { title, description, url: `${SITE}/sted/${s.slug}`, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const HERO_TEKST: Record<string, { tittel: string; undertekst: string; bg: string }> = {
  smil: { tittel: "Smil! 🎉", undertekst: "Kjøkkenet fikk godkjent ved siste tilsyn.", bg: "bg-smil-soft" },
  strek: { tittel: "Strekmunn 😬", undertekst: "Mattilsynet fant brudd som må følges opp.", bg: "bg-strek-soft" },
  sur: { tittel: "Sur munn! 🚨", undertekst: "Mattilsynet fant alvorlige brudd på regelverket.", bg: "bg-sur-soft" },
  ukjent: { tittel: "Ukjent", undertekst: "Siste tilsyn mangler karakter.", bg: "bg-ukjent-soft" },
};

function jsonLd(s: Sted) {
  return {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: s.navn,
    url: `${SITE}/sted/${s.slug}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: s.adresse,
      postalCode: s.postnr || undefined,
      addressLocality: s.poststed || undefined,
      addressCountry: "NO",
    },
    ...(s.lat !== null && s.lng !== null ? { geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng } } : {}),
  };
}

export default async function StedSide({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const s = getSted(slug);
  if (!s) notFound();

  const iDag = getDatasett().generert.slice(0, 10);
  const siste = sisteTilsyn(s);
  const kind = kindFromKarakter(siste.karakter);
  const hero = HERO_TEKST[kind];
  const stats = stedStats(s);
  const gammel = dagerMellom(siste.dato, iDag) > 730;
  const nabo = naermeste(s, 6);
  const kjede = s.kjedeSlug ? kjedeSteder(s.kjedeSlug).filter((k) => k.id !== s.id) : [];
  const egen = fordeling(ordinaereKarakterer(s));
  const land = landFordeling();
  const egenAndel = andel(egen, "smil");
  const landAndel = andel(land, "smil");
  const innsikt =
    egen.total >= 3 && egenAndel <= landAndel - 0.15
      ? `Men: bare ${prosent(egenAndel)} av de ordinære tilsynene her har endt med smil. Snittet i Norge er ${prosent(landAndel)}.`
      : egen.total >= 4 && egen.smil === egen.total
        ? `Feilfri rekke: alle ${egen.total} ordinære tilsyn har gitt smil. 🏆`
        : null;
  const kjedeRate = (k: Sted) => {
    const f = fordeling(ordinaereKarakterer(k));
    return f.total ? andel(f, "smil") : -1;
  };

  return (
    <article className="space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(s)).replace(/</g, "\\u003c") }} />

      <nav aria-label="Brødsmuler" className="text-sm font-semibold text-ink-soft">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link className="hover:text-ink" href="/">Kart</Link></li>
          {s.fylke && (<><li aria-hidden>›</li><li>{s.fylke}</li></>)}
          {s.kommune && s.kommune !== s.fylke && (<><li aria-hidden>›</li><li>{s.kommune}</li></>)}
          <li aria-hidden>›</li>
          <li aria-current="page" className="text-ink">{s.navn}</li>
        </ol>
      </nav>

      {/* Hero */}
      <section className={`card relative overflow-hidden ${hero.bg} p-5 sm:p-8`}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="pop-in shrink-0 -rotate-6">
            <Smiley kind={kind} size={132} label={kind === "ukjent" ? "Ukjent karakter" : SMILE_LABEL[kind]} />
          </div>
          <div className="min-w-0 space-y-3">
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{s.navn}</h1>
            <p className="text-lg text-ink-soft">
              {[s.adresse, [s.postnr, s.poststed].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="chip">{KATEGORI_EMOJI[s.kategori]} {KATEGORI_NAVN[s.kategori]}</span>
              {s.kjede && <span className="chip">🔗 {s.kjede}</span>}
              {s.kommune && <span className="chip">📍 {s.kommune}</span>}
              {s.orgnr && (
                <a className="chip" href={`https://virksomhet.brreg.no/oppslag/enheter/${s.orgnr}`} target="_blank" rel="noopener noreferrer">
                  🏢 Org.nr {s.orgnr}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 border-t-2 border-dashed border-line/40 pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-display text-2xl font-extrabold">{hero.tittel}</p>
            <p className="text-ink-soft">
              {hero.undertekst} Siste tilsyn: <strong className="text-ink">{formatDato(siste.dato)}</strong> ({tidSiden(siste.dato, new Date(iDag))})
              {siste.oppfolging && " – et oppfølgingstilsyn"}.
            </p>
            {innsikt && <p className="mt-2 font-semibold">{innsikt}</p>}
            {gammel && (
              <p className="mt-2 inline-block rounded-xl bg-card/70 px-3 py-1.5 text-sm font-semibold">
                ⏳ Det er over to år siden forrige tilsyn – ting kan ha endret seg siden.
              </p>
            )}
          </div>
          {s.lat !== null && (
            <Link href={`/?sted=${encodeURIComponent(s.slug)}`} className="btn btn-primary justify-self-start">
              🗺️ Vis på kartet
            </Link>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Tema for tema */}
          <section className="card p-5 sm:p-6" aria-labelledby="tema-tittel">
            <h2 id="tema-tittel" className="font-display text-2xl font-extrabold">Tema for tema</h2>
            <p className="mb-4 text-sm text-ink-soft">
              Mattilsynet vurderer fire områder. Det dårligste området bestemmer smilefjeset.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {TEMAER.map((tema, i) => {
                const k = siste.temaer[i];
                return (
                  <li key={tema.key} className="flex gap-3 rounded-2xl border-2 border-line/20 bg-paper p-3">
                    {isGraded(k) ? <Smiley kind={kindFromKarakter(k)} size={40} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-line/40 text-lg" aria-hidden>–</span>}
                    <div>
                      <p className="font-bold">{tema.navn}</p>
                      <p className="text-sm text-ink-soft">{KARAKTER_FORKLARING[k] ?? "Ingen vurdering registrert."}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Historikk */}
          <section className="card p-5 sm:p-6" aria-labelledby="historikk-tittel">
            <h2 id="historikk-tittel" className="font-display text-2xl font-extrabold">Historikken</h2>
            <p className="mb-4 text-sm text-ink-soft">
              {stats.antall} tilsyn siden {formatDato(stats.forste)}
              {stats.antallOppfolging > 0 && `, hvorav ${stats.antallOppfolging} oppfølging${stats.antallOppfolging > 1 ? "er" : ""}`}.
            </p>
            <Tidslinje tilsyn={s.tilsyn} iDag={iDag} />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-line">
                    <th scope="col" className="py-2 pr-3">Dato</th>
                    <th scope="col" className="py-2 pr-3">Resultat</th>
                    {TEMAER.map((t) => (
                      <th key={t.key} scope="col" className="hidden py-2 pr-3 sm:table-cell" title={t.navn}>{t.kort}</th>
                    ))}
                    <th scope="col" className="py-2">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.tilsyn].reverse().map((t, i) => {
                    const sm = smileFromKarakter(t.karakter);
                    return (
                      <tr key={i} className="border-b border-line/15">
                        <td className="py-2 pr-3 tabular-nums">{formatDato(t.dato)}</td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <Smiley kind={kindFromKarakter(t.karakter)} size={20} />
                            {sm ? SMILE_LABEL[sm] : "Ukjent"}
                          </span>
                        </td>
                        {t.temaer.map((k, j) => (
                          <td key={j} className="hidden py-2 pr-3 sm:table-cell">
                            {isGraded(k) ? <Smiley kind={kindFromKarakter(k)} size={18} label={`${TEMAER[j].navn}: karakter ${k}`} /> : <span className="text-ink-soft" title={KARAKTER_FORKLARING[k]}>–</span>}
                          </td>
                        ))}
                        <td className="py-2 text-ink-soft">{t.oppfolging ? "Oppfølging" : "Ordinært"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5" aria-labelledby="fakta-tittel">
            <h2 id="fakta-tittel" className="font-display text-xl font-extrabold">Kort fortalt</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Fakta tall={String(stats.antall)} tekst="tilsyn totalt" />
              <Fakta tall={`${egen.smil}/${egen.total}`} tekst="ordinære tilsyn med smil" />
              <Fakta tall={String(stats.fordeling.sur)} tekst={stats.fordeling.sur === 1 ? "sur munn" : "sure munner"} />
              <Fakta tall={String(stats.lengsteSmilRekke)} tekst="smil på rad (rekord)" />
            </dl>
          </section>

          <section className="card space-y-4 p-5" aria-labelledby="sammenlign-tittel">
            <h2 id="sammenlign-tittel" className="font-display text-xl font-extrabold">Sånn er det ellers</h2>
            <p className="text-sm text-ink-soft">
              Utfall av ordinære tilsyn siden 2016. Oppfølgingstilsyn er holdt utenfor, siden nesten alle ender med smil.
            </p>
            {egen.total > 0 && <FordelingBar fordeling={egen} label={s.navn} />}
            {s.kjedeSlug && <FordelingBar fordeling={kjedeFordeling(s.kjedeSlug)} label={`Hele ${s.kjede}`} compact />}
            {s.kommunenr && <FordelingBar fordeling={kommuneFordeling(s.kommunenr)} label={s.kommune ?? "Kommunen"} compact />}
            <FordelingBar fordeling={land} label="Hele Norge" compact />
          </section>

          {nabo.length > 0 && (
            <section className="card p-5" aria-labelledby="naer-tittel">
              <h2 id="naer-tittel" className="font-display text-xl font-extrabold">Naboene</h2>
              <ul className="mt-3 space-y-1">
                {nabo.map(({ sted, km }) => (
                  <StedLenke key={sted.id} sted={sted} meta={km < 0.03 ? "samme adresse" : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`} />
                ))}
              </ul>
            </section>
          )}

          {kjede.length > 0 && (
            <section className="card p-5" aria-labelledby="kjede-tittel">
              <h2 id="kjede-tittel" className="font-display text-xl font-extrabold">Resten av {s.kjede}</h2>
              <p className="mt-1 text-sm text-ink-soft">
                {kjede.length} andre steder. Sortert etter andel ordinære tilsyn med smil.
              </p>
              <ul className="mt-3 space-y-1">
                {kjede
                  .map((k) => ({ k, rate: kjedeRate(k) }))
                  .sort((a, b) => b.rate - a.rate || a.k.navn.localeCompare(b.k.navn, "nb"))
                  .slice(0, 6)
                  .map(({ k, rate }) => (
                    <StedLenke key={k.id} sted={k} meta={rate >= 0 ? prosent(rate) : "–"} />
                  ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}

function Fakta({ tall, tekst }: { tall: string; tekst: string }) {
  return (
    <div className="rounded-2xl bg-paper p-3">
      <dt className="sr-only">{tekst}</dt>
      <dd>
        <span className="block font-display text-2xl font-extrabold tabular-nums">{tall}</span>
        <span className="text-xs font-semibold text-ink-soft">{tekst}</span>
      </dd>
    </div>
  );
}

function StedLenke({ sted, meta }: { sted: Sted; meta: string }) {
  return (
    <li>
      <Link href={`/sted/${sted.slug}`} className="-mx-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-accent-soft">
        <Smiley kind={kindFromKarakter(sisteTilsyn(sted).karakter)} size={24} />
        <span className="min-w-0 flex-1 truncate font-semibold">{sted.navn}</span>
        <span className="shrink-0 text-xs tabular-nums text-ink-soft">{meta}</span>
      </Link>
    </li>
  );
}
