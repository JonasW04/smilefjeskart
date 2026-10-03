import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import Smiley from "@/components/Smiley";
import { anmerkningAndel, endringPp, flestAnmerkninger } from "@/lib/analyse";
import { aksePst, pp, tall } from "@/lib/chart";
import { getDatasett, landFordeling } from "@/lib/server/data";
import {
  getOmrade,
  kommuner,
  landPerAar,
  MIN_KJEDE_STEDER,
  MIN_KOMMUNE,
  omradePerAar,
  plassering,
  type Omrade,
} from "@/lib/server/omrader";
import { SMILE_LABEL, smileFromKarakter } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, formatDato, ordinaereKarakterer, fordeling, prosent, sisteTilsyn } from "@/lib/stats";
import type { Sted } from "@/lib/types";
import { Flis, Forklaring, Seksjon, TallTabell } from "./Deler";
import Kolonner from "./Kolonner";
import { SmileySprite } from "./SmileySprite";
import StedRader from "./StedRader";
import StabelRader, { StabelForklaring, type StabelRad } from "./StabelRader";

export const SITE = "https://smilefjeskartet.no";

/** Under dette antallet ordinære tilsyn i et år tegnes året blekt og merkes som usikkert. */
const LITE_AAR = 10;

const TYPE_TEKST = {
  kommune: { flertall: "kommuner", emoji: "📍", sti: "kommune" },
  fylke: { flertall: "fylker", emoji: "🗺️", sti: "fylke" },
  kjede: { flertall: "kjeder", emoji: "🔗", sti: "kjede" },
} as const;

export function omradeUrl(o: Pick<Omrade, "type" | "slug">): string {
  return `${SITE}/${TYPE_TEKST[o.type].sti}/${o.slug}`;
}

export function omradeTittel(o: Omrade): string {
  if (o.type === "kjede") return `${o.navn}: smilefjes på alle ${o.steder.length} steder`;
  if (o.type === "fylke") return `Smilefjes i ${o.navn}`;
  return o.visningsnavn !== o.navn ? `Smilefjes i ${o.navn} kommune, ${o.fylke}` : `Smilefjes i ${o.navn} kommune`;
}

export function omradeMetadata(o: Omrade | null): Metadata {
  if (!o) return { title: "Fant ikke siden – Smilefjeskartet" };
  const smil = prosent(andel(o.ordinaer, "smil"));
  const title = `${omradeTittel(o)} | Smilefjeskartet`;
  const description =
    o.type === "kjede"
      ? `${smil} av Mattilsynets ordinære tilsyn hos ${o.navn} har endt med smil (Norge: ${prosent(andel(landFordeling(), "smil"))}). Se utviklingen og alle ${o.steder.length} stedene.`
      : `${tall(o.steder.length)} serveringssteder og ${tall(o.tilsyn)} tilsyn i ${o.navn}. ${smil} av de ordinære tilsynene har endt med smil. Se utviklingen, sammenligningen med landet og alle stedene.`;
  const url = omradeUrl(o);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function ordinaerFor(s: Sted) {
  return fordeling(ordinaereKarakterer(s));
}

export default function OmradeSide({ o }: { o: Omrade }) {
  const tt = TYPE_TEKST[o.type];
  const land = landFordeling();
  const landSmil = andel(land, "smil");
  const smil = andel(o.ordinaer, "smil");
  const aar = omradePerAar(o);
  const landAar = landPerAar();
  const plass = plassering(o);
  const iDag = getDatasett().generert.slice(0, 10);
  const fylke = o.type === "kommune" && o.fylkeSlug ? getOmrade("fylke", o.fylkeSlug) : null;
  const liteUtvalg = o.ordinaer.total < 30;

  // Brødsmuler
  const smuler: Array<{ navn: string; href?: string }> = [{ navn: "Analyse", href: "/analyse" }];
  if (o.type === "kommune" && fylke) smuler.push({ navn: fylke.navn, href: `/fylke/${fylke.slug}` });
  if (o.type === "fylke") smuler.push({ navn: "Fylker", href: "/analyse#fylker" });
  if (o.type === "kjede") smuler.push({ navn: "Kjeder", href: "/analyse#kjeder" });
  smuler.push({ navn: o.navn });

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: smuler.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.navn,
      item: s.href ? `${SITE}${s.href.split("#")[0]}` : omradeUrl(o),
    })),
  };

  // Sammenligning
  const sammenlign: StabelRad[] = [
    { key: "o", navn: o.navn, tekst: o.navn, fordeling: o.ordinaer, uthevet: true, meta: `${tall(o.ordinaer.total)} tilsyn` },
  ];
  if (fylke)
    sammenlign.push({
      key: "f",
      navn: fylke.navn,
      tekst: fylke.navn,
      href: `/fylke/${fylke.slug}`,
      fordeling: fylke.ordinaer,
      meta: "fylket",
    });
  sammenlign.push({ key: "n", navn: "Hele Norge", tekst: "Hele Norge", href: "/analyse", fordeling: land });

  // Steder
  const steder = [...o.steder].sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  const nylig = [...o.steder].sort((a, b) => sisteTilsyn(b).dato.localeCompare(sisteTilsyn(a).dato)).slice(0, 8);
  const gjengangere = flestAnmerkninger(o.steder, 2).slice(0, 6);

  const sisteAar = aar[aar.length - 1];
  const heleAar = [...aar].reverse().find((r) => !r.delvis);

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

      {/* Hero */}
      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="pop-in shrink-0 -rotate-6" aria-hidden>
            <Smiley kind={smil >= landSmil - 0.02 ? "smil" : "strek"} size={112} />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              {tt.emoji} {o.type === "kommune" ? `Kommune${o.fylke ? ` i ${o.fylke}` : ""}` : o.type === "fylke" ? "Fylke" : "Kjede"}
            </p>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{o.navn}</h1>
            <p className="text-lg text-ink-soft">
              <strong className="text-ink">{prosent(smil)}</strong> av de ordinære tilsynene har endt med smil
              {o.ordinaer.total > 0 && (
                <>
                  {" "}
                  – {Math.abs(smil - landSmil) < 0.005 ? "omtrent som" : smil > landSmil ? "bedre enn" : "svakere enn"} landssnittet på{" "}
                  {prosent(landSmil)}
                </>
              )}
              .
            </p>
            {liteUtvalg && (
              <p className="inline-block rounded-xl bg-card/70 px-3 py-1.5 text-sm font-semibold">
                🔬 Lite utvalg: bare {o.ordinaer.total} ordinære tilsyn. Tallene kan svinge mye.
              </p>
            )}
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Flis
          etikett="Steder"
          verdi={tall(o.steder.length)}
          under={o.type === "fylke" ? `i ${new Set(o.steder.map((s) => s.kommunenr)).size} kommuner` : "med tilsyn siden 2016"}
        />
        <Flis etikett="Tilsyn" verdi={tall(o.tilsyn)} under={`${tall(o.ordinaer.total)} ordinære`} />
        <Flis etikett="Ordinære med smil" verdi={prosent(smil)} under={`${pp(endringPp(landSmil, smil))} mot Norge`} />
        <Flis
          etikett="Plassering"
          verdi={plass ? `${plass.plass}.` : "–"}
          under={
            plass
              ? `av ${plass.av} ${tt.flertall}${o.type === "kommune" ? ` med ≥ ${MIN_KOMMUNE} tilsyn` : o.type === "kjede" ? ` med ≥ ${MIN_KJEDE_STEDER} steder` : ""}`
              : o.type === "kommune"
                ? `rangeres ikke under ${MIN_KOMMUNE} ordinære tilsyn`
                : `rangeres ikke under ${MIN_KJEDE_STEDER} steder`
          }
        />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Seksjon
          id="utvikling"
          emoji="📈"
          tittel="Utviklingen"
          ingress={
            <>
              Andel ordinære tilsyn med strekmunn eller sur munn per år, mot hele Norge (linjen med prikker).
              {heleAar && heleAar.ordinaer.total > 0 && (
                <>
                  {" "}
                  I {heleAar.aar}: {prosent(anmerkningAndel(heleAar.ordinaer))} mot{" "}
                  {prosent(anmerkningAndel(landAar.find((r) => r.aar === heleAar.aar)!.ordinaer))} i Norge.
                </>
              )}{" "}
              Blek kolonne = færre enn {LITE_AAR} tilsyn det året{sisteAar.delvis ? `, eller ${sisteAar.aar} som ikke er ferdig` : ""}.
            </>
          }
        >
          <Forklaring
            punkter={[
              { navn: "Strekmunn", smiley: "strek" },
              { navn: "Sur munn", smiley: "sur" },
              { navn: "Norge", strek: "stroke-ink" },
            ]}
          />
          <Kolonner
            lgBredde={600}
            label={`Andel strekmunn og sur munn per år i ${o.navn}, sammenlignet med Norge.`}
            format={aksePst}
            minMaks={0.2}
            referanse={landAar.map((r) => anmerkningAndel(r.ordinaer))}
            kolonner={aar.map((r, i) => ({
              etikett: String(r.aar),
              kort: `’${String(r.aar).slice(2)}`,
              dempet: r.delvis || r.ordinaer.total < LITE_AAR,
              delvis: r.delvis,
              deler: [
                { verdi: andel(r.ordinaer, "strek"), fyll: "fill-strek" },
                { verdi: andel(r.ordinaer, "sur"), fyll: "fill-sur" },
              ],
              tips: `${r.ordinaer.total ? prosent(anmerkningAndel(r.ordinaer), 1) : "–"} strek/sur|${r.aar}${r.delvis ? " (hittil)" : ""}: ${tall(r.ordinaer.total)} ordinære tilsyn|Norge: ${prosent(anmerkningAndel(landAar[i].ordinaer), 1)}`,
            }))}
          />
          <TallTabell
            tittel={`Ordinære tilsyn per år i ${o.navn}`}
            kolonner={["År", "Ordinære", "Smil", "Strek", "Sur", "Norge strek/sur"]}
            rader={aar.map((r, i) => [
              `${r.aar}${r.delvis ? " (hittil)" : ""}`,
              tall(r.ordinaer.total),
              String(r.ordinaer.smil),
              String(r.ordinaer.strek),
              String(r.ordinaer.sur),
              prosent(anmerkningAndel(landAar[i].ordinaer), 1),
            ])}
          />
        </Seksjon>

        <Seksjon
          id="sammenlign"
          emoji="⚖️"
          tittel="Sånn er det ellers"
          ingress="Utfall av ordinære tilsyn siden 2016. Oppfølgingstilsyn er holdt utenfor, siden nesten alle ender med smil."
        >
          <StabelForklaring />
          <StabelRader rader={sammenlign} />
        </Seksjon>
      </div>

      {o.type === "fylke" ? (
        <FylkeKommuner o={o} landSmil={landSmil} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Seksjon id="nylig" emoji="🆕" tittel="Sist inspisert">
              <StedListe steder={nylig.map((s) => ({ s, meta: formatDato(sisteTilsyn(s).dato) }))} visKommune={o.type === "kjede"} />
            </Seksjon>
            <Seksjon
              id="gjengangere"
              emoji="🔁"
              tittel="Flest anmerkninger"
              ingress="Steder med flest ordinære tilsyn som endte med strekmunn eller sur munn. Fjeset viser siste resultat."
            >
              {gjengangere.length > 0 ? (
                <StedListe
                  steder={gjengangere.map((g) => ({ s: g.sted, meta: `${g.ordinaer.strek + g.ordinaer.sur} av ${g.ordinaer.total}` }))}
                  visKommune={o.type === "kjede"}
                />
              ) : (
                <p className="text-sm">🎉 Ingen steder her har fått strekmunn eller sur munn mer enn én gang.</p>
              )}
            </Seksjon>
          </div>

          <Seksjon
            id="steder"
            emoji="🍽️"
            tittel={`Alle ${tall(steder.length)} steder`}
            ingress="Fjeset viser siste tilsyn. Tallet til høyre viser hvor mange av de ordinære tilsynene som endte med smil, f.eks. 3/4."
          >
            <StedRader
              kolonner={3}
              rader={steder.map((s) => {
                const f = ordinaerFor(s);
                const k = smileFromKarakter(sisteTilsyn(s).karakter);
                return {
                  key: s.slug,
                  slug: s.slug,
                  navn: s.navn,
                  kind: kindFromKarakter(sisteTilsyn(s).karakter),
                  label: k ? SMILE_LABEL[k] : "Ukjent",
                  under: o.type === "kjede" ? (s.kommune ?? s.poststed) : s.adresse || s.poststed,
                  meta: f.total ? `${f.smil}/${f.total}` : "–",
                };
              })}
            />
          </Seksjon>
        </>
      )}

      <p className="text-sm text-ink-soft">
        Tall fra Mattilsynets åpne tilsynsdata, oppdatert {formatDato(iDag)}.{" "}
        {o.type === "kjede" ? "Kjede gjettes ut fra stedsnavnet og kan ta feil for enkeltsteder." : "Kommune er utledet fra postnummer."}{" "}
        <Link className="link" href="/analyse">
          Se hele analysen
        </Link>
      </p>
    </article>
  );
}

function StedListe({ steder, visKommune }: { steder: Array<{ s: Sted; meta: string }>; visKommune: boolean }) {
  return (
    <StedRader
      rader={steder.map(({ s, meta }) => ({
        key: s.id,
        slug: s.slug,
        navn: s.navn,
        kind: kindFromKarakter(sisteTilsyn(s).karakter),
        under: visKommune ? (s.kommune ?? s.poststed) : s.adresse || s.poststed,
        meta,
      }))}
    />
  );
}

function FylkeKommuner({ o, landSmil }: { o: Omrade; landSmil: number }): ReactNode {
  const liste = kommuner()
    .filter((k) => k.fylkeSlug === o.slug)
    .sort((a, b) => andel(b.ordinaer, "smil") - andel(a.ordinaer, "smil") || b.ordinaer.total - a.ordinaer.total);
  const store = liste.filter((k) => k.ordinaer.total >= MIN_KOMMUNE);
  const smaa = liste.filter((k) => k.ordinaer.total < MIN_KOMMUNE);
  return (
    <Seksjon
      id="kommuner"
      emoji="🏘️"
      tittel={`Kommunene i ${o.navn}`}
      ingress={`Sortert etter andel smil i ordinære tilsyn. Kommuner med færre enn ${MIN_KOMMUNE} ordinære tilsyn står for seg selv nederst – der kan noen få tilsyn snu tallet.`}
    >
      <StabelForklaring referanse={landSmil} />
      <StabelRader
        referanse={landSmil}
        rader={store.map((k) => ({
          key: k.id,
          navn: k.visningsnavn,
          tekst: k.visningsnavn,
          href: `/kommune/${k.slug}`,
          fordeling: k.ordinaer,
          meta: `${tall(k.ordinaer.total)} tilsyn`,
        }))}
      />
      {smaa.length > 0 && (
        <>
          <h3 className="mt-6 mb-3 font-display text-lg font-extrabold">Små kommuner</h3>
          <StabelRader
            referanse={landSmil}
            rader={smaa.map((k) => ({
              key: k.id,
              navn: k.visningsnavn,
              tekst: k.visningsnavn,
              href: `/kommune/${k.slug}`,
              fordeling: k.ordinaer,
              meta: `${tall(k.ordinaer.total)} tilsyn`,
            }))}
          />
        </>
      )}
    </Seksjon>
  );
}
