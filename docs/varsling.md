# Smilefjesvarsling på e-post – oppsett og drift

Smilefjeskartet kan sende e-post når Mattilsynet har vært på besøk i et område brukeren har valgt.
Alt er kodet ferdig, men står **av** til du har lagt inn nøklene under. Uten dem:

- viser `/varsling` en «Varsling kommer snart»-boks i stedet for skjemaet,
- svarer API-et `503` med `{"kode": "ikke_konfigurert"}`,
- skriver utsendingsjobben i GitHub Actions «Hopper over» og avslutter uten feil.

## Slik henger det sammen

1. Brukeren velger et område (punkt + radius på 2/5/10/25 km, eller opptil 10 kommuner), hvilke
   smilefjes hen vil høre om, og skriver inn e-post på `/varsling`.
2. `POST /api/varsling/abonner` validerer, sjekker grenser og lagrer et **ventende** abonnement i
   Upstash Redis (slettes automatisk etter 48 timer), og sender en bekreftelses-e-post via Resend.
3. Lenken i e-posten (`/api/varsling/bekreft?token=…`) er HMAC-signert og gyldig i 48 timer.
   Den aktiverer abonnementet og sender brukeren til `/varsling/bekreftet`.
4. Hver morgen, etter at tilsynsdataene er oppdatert, kjører GitHub Actions `npm run send:varsler`.
   Den finner tilsyn som er nye siden sist, og sender **ett sammendrag per abonnent** (maks én e-post
   per UTC-døgn, også ved manuelle omkjøringer).
5. Varslings-e-poster har «Meld meg av»-lenke og `List-Unsubscribe`-headere. Lenken åpner en side
   der brukeren bekrefter avmeldingen. E-postklientens «Avslutt abonnement» melder av direkte
   med ett klikk (RFC 8058 POST). Avmelding sletter abonnementet fra databasen med én gang.
   Automatisk GET-skanning av lenker endrer ingenting.

Én e-postadresse har ett varsel. Bekrefter man et nytt, erstatter det det gamle.

## 1. Opprett databasen hos Upstash

1. Lag en konto på <https://console.upstash.com>.
2. **Create Database** → type **Redis**.
   - Navn: f.eks. `smilefjeskartet`
   - Region: **EU** (f.eks. `eu-central-1` Frankfurt eller `eu-west-1` Irland). Personvernteksten
     på nettsiden sier at dataene ligger i EU, så velg en EU-region.
   - Plan: **Free** holder lenge (500 000 kommandoer i måneden).
3. Åpne databasen. Under **Configuration**: sørg for at **Eviction** er **av**, ellers kan Redis
   kaste ut abonnementer når den blir full.
4. Under **REST API** finner du to verdier – kopier dem:
   - `UPSTASH_REDIS_REST_URL` (starter med `https://`)
   - `UPSTASH_REDIS_REST_TOKEN` (bruk den vanlige, *ikke* «read-only»)

## 2. Opprett Resend-kontoen og verifiser domenet

1. Lag en konto på <https://resend.com>.
2. **Domains → Add Domain**. Bruk gjerne et underdomene, f.eks. `varsel.smilefjeskartet.no`, så
   e-post fra varslene ikke påvirker ryktet til hoveddomenet. Velg region **EU (Ireland)**.
3. Resend viser noen DNS-poster (MX og TXT for SPF, TXT for DKIM). Legg dem inn hos DNS-leverandøren
   for smilefjeskartet.no, nøyaktig som vist. Legg også gjerne til en DMARC-post:
   `_dmarc.smilefjeskartet.no  TXT  "v=DMARC1; p=none;"`
4. Trykk **Verify** og vent til domenet står som **Verified** (som regel noen minutter, av og til
   noen timer).
5. I domeneinnstillingene: sjekk at **Open tracking** og **Click tracking** er **av**. Nettsiden
   lover at e-postene ikke har sporing.
6. **API Keys → Create API Key**: tilgang **Sending access**, begrenset til domenet ditt.
   Kopier nøkkelen (`re_…`) – den vises bare én gang. Dette er `RESEND_API_KEY`.
7. Bestem avsenderadressen, f.eks. `Smilefjeskartet <hei@varsel.smilefjeskartet.no>`.
   Dette er `VARSLING_FRA`. Domenet må være det du verifiserte.

Gratisplanen hos Resend tillater 100 e-poster per dag og 3 000 per måned. Blir kvoten brukt opp,
venter resten av sammendragene trygt i en utboks til neste kjøring.

## 3. Lag en hemmelig nøkkel

Den brukes til å signere lenker og til å hashe e-post/IP i Redis. Kjør i en terminal:

```sh
openssl rand -base64 48
```

Resultatet er `VARSLING_SECRET` (minst 32 tegn). **Ikke bytt den uten grunn**: alle bekreftelses- og
avmeldingslenker i e-poster som allerede er sendt, slutter å virke, og eksisterende abonnenter får
ikke erstattet sitt gamle varsel når de melder seg på igjen. Bytt den bare hvis den har lekket (og
slett i så fall alle abonnementer, se under).

## 4. Legg inn miljøvariabler i Vercel

Vercel → prosjektet → **Settings → Environment Variables**. Legg til for miljøet **Production**:

| Navn | Verdi |
|---|---|
| `UPSTASH_REDIS_REST_URL` | fra steg 1 |
| `UPSTASH_REDIS_REST_TOKEN` | fra steg 1 |
| `RESEND_API_KEY` | fra steg 2 |
| `VARSLING_FRA` | f.eks. `Smilefjeskartet <hei@varsel.smilefjeskartet.no>` |
| `VARSLING_SECRET` | fra steg 3 |
| `NEXT_PUBLIC_SITE_URL` | `https://smilefjeskartet.no` (valgfri, dette er standard) |

Ikke legg dem inn for **Preview** med mindre du vil at forhåndsvisninger skal kunne sende ekte e-post.

**Deploy på nytt** etterpå (Deployments → ⋯ → Redeploy). `/varsling` bygges statisk og leser
variablene ved bygging, så siden viser skjemaet først etter en ny deploy.

## 5. Legg inn secrets i GitHub

GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret**.
Legg inn disse fem, med samme verdier som i Vercel:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`
- `VARSLING_SECRET`
- `VARSLING_FRA`

Steget «Send smilefjesvarsler» i `.github/workflows/update-tilsyndata.yml` bruker dem. Uten dem
hopper steget over.

## 6. Test at alt virker

1. **Første kjøring av jobben**: Actions → «Update tilsyndata» → **Run workflow**. I loggen for
   «Send smilefjesvarsler» skal det stå «Første kjøring: husket N tilsyn … Sender ingenting denne
   gangen.» Det er meningen: jobben husker hva som finnes nå, og varsler bare om det som kommer etter.
2. **Meld deg på** på <https://smilefjeskartet.no/varsling>. Du skal få en bekreftelses-e-post i
   løpet av et minutt. Trykk på lenken – du havner på «Varselet er på! 🎉».
3. **Sjekk status** lokalt (krever variablene i en `.env.local` eller i terminalen):

   ```sh
   npm run varsling:admin -- status
   ```

4. **Se hvordan sammendraget ser ut** uten å vente på nye tilsyn:

   ```sh
   npm run varsling:admin -- test-epost din@adresse.no   # sender et eksempel med ekte data
   npm run varsling:admin -- forhandsvis                 # skriver HTML-filer til .varsling-forhandsvisning/ (trenger ingen nøkler)
   ```

5. **Avmelding**: trykk «Meld meg av» nederst i e-posten og bekreft på siden som åpnes, eller bruk
   «Avslutt abonnement» i Gmail direkte.
   `status` skal da vise én abonnent mindre.

Lokalt kan du kjøre hele flyten med `npm run dev` og en `.env.local` med variablene over pluss
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`, så lenkene i e-posten peker til din maskin.
(Bruk gjerne en egen Upstash-database til testing.)

De vanlige testene kjører med falsk Redis. Har du `redis-server` og `redis-cli` installert,
kan du også validere Lua-skriptene og samtidige operasjoner mot en isolert, midlertidig Redis:
`VARSLING_TEST_REDIS=1 npm test -- __tests__/varsling/store-redis.test.ts`.
Testen bruker bare en lokal Unix-socket, uten nettverksport eller varig lagring.

## Slette en abonnent

Brukeren kan alltid slette seg selv med lenken i e-posten. Ber noen deg om sletting:

```sh
npm run varsling:admin -- slett navn@eksempel.no
```

Skriptet finner og sletter både aktive abonnementer og alle ventende påmeldinger for adressen,
inkludert utboks og leveringskvitteringer. `VARSLING_SECRET` brukes til å rydde opp i HMAC-oppslaget.
Vil du slette **alt** (f.eks. etter
å ha byttet hemmelighet), kan du slette alle nøkler som starter med `varsling:` i Upstash-konsollen
(Data Browser), eller kjøre `FLUSHDB` hvis databasen bare brukes til dette.

## Skru av varsling

Slett `RESEND_API_KEY` (eller en av de andre) i Vercel og GitHub, og deploy på nytt. Siden går
tilbake til «kommer snart», og jobben hopper over. Dataene i Redis blir liggende til du sletter dem.

## Drift og grenser

| Hva | Grense |
|---|---|
| Påmeldinger per IP | 10 per time (svarer 429) |
| Bekreftelses-e-poster per adresse | 3 per døgn (resten ignoreres i stillhet, så ingen kan se om adressen er i bruk) |
| Bekreftelses-e-poster totalt | 300 per døgn (vern om e-postkvoten) |
| Ubekreftede påmeldinger | slettes etter 48 timer |
| E-poster per abonnent | maks én per UTC-døgn, maks 25 steder i hver |
| Tempo mot Resend | ca. 1,7 per sekund, med omforsøk ved 429/5xx |

- **Nye tilsyn** oppdages med en liste over «sette» tilsyn (`stedId|dato|karakter`) for de siste
  60 dagene, ikke med en datogrense. Derfor fanges også tilsyn som Mattilsynet publiserer sent.
- **Mistenkelig mange nye tilsyn** på én gang (over 2 500, f.eks. fordi Mattilsynet har byttet
  ID-er) behandles som en dataendring: de merkes som sett uten at noen varsles. Grensen kan
  overstyres med miljøvariabelen `VARSLING_MAKS_NYE` i workflowen.
- **Feil ved sending**: et sammendrag som feiler, blir liggende i utboksen og prøves igjen ved neste
  kjøring (maks 3 forsøk). Innhold, avsender og idempotensnøkkel låses før første forsøk. Nye treff
  venter i neste sammendrag, slik at en uavklart tidligere sending ikke endres. Ugyldige adresser
  fjernes fra utboksen med en gang; feil med avsenderkontoen stopper jobben og bevarer hele køen.
- **Kjører jobben to ganger** samme dag, holder en lagret kvittering grensen på én e-post per
  abonnent. GitHub-kjøringer venter på hverandre (`concurrency`), og en kvittert køpost ryddes uten
  ny sending hvis jobben krasjet før køslettingen. Ikke kjør lokale utsendinger samtidig med Actions.
- **Uavklart levering**: [Resend husker idempotensnøkler i 24 timer](https://resend.com/docs/dashboard/emails/idempotency-keys).
  Hvis Resend tok imot e-posten, men svaret og lokal kvittering gikk tapt, kan et omforsøk etter
  dette vinduet gi en duplikat. Dette kan ikke avgjøres sikkert fra en nettverksfeil alene.
- **Synlige driftsfeil**: avsender-/protokollfeil gir en feilet Actions-kjøring etter at tilsynsdataene
  er publisert. Kvotestopp er normalt og lar køen vente til neste kjøring.
- **Logger** inneholder aldri e-postadresser, bare antall og de første tegnene i abonnements-ID-er.
  Oppsummeringen vises også i «Summary» for hver kjøring i GitHub Actions.

### Nøkler i Redis

| Nøkkel | Innhold |
|---|---|
| `varsling:abo:<id>` | abonnementet som JSON (e-post, område, filtre, tidspunkter) |
| `varsling:epost:<hmac>` | id-en til det aktive abonnementet for en e-postadresse |
| `varsling:aktive` | sett med id-er til alle aktive abonnementer |
| `varsling:utboks` | sammendrag som venter på å bli sendt |
| `varsling:sendt:<id>` | siste leveringskvittering (UTC-dag og idempotensnøkkel), slettes med abonnementet |
| `varsling:sett`, `varsling:sett:klar` | tilsyn som allerede er sett av jobben |
| `varsling:rl:*` | tellere for grensene over (utløper av seg selv) |

### Mulige forbedringer senere

- Webhook fra Resend for «bounce» og «complaint», så adresser som ikke finnes eller merker oss som
  spam, slettes automatisk.
- Resend sitt batch-API hvis det blir mange tusen abonnenter (i dag sendes én og én).
