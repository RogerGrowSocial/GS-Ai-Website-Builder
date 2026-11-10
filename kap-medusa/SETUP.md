# KAP — Medusa v2 commerce-service

## Huidige staat

**Geïnstalleerd in code, geïsoleerd getest, nog niet permanent gehost of live.**

- Medusa v2 backend: `kap-medusa/apps/backend`; versies vastgezet in `package.json` én `package-lock.json`.
- Bestaande KAP Studio: `kap-ops`, met beveiligde read-only Admin API-adapter.
- GitHub QA: `.github/workflows/kap-medusa-smoke.yml` boot Medusa met PostgreSQL 16 en Redis 7, bouwt de app, maakt een tijdelijke admin en secret API key, controleert beide echte Medusa list endpoints met de KAP Studio-adapter en verifieert een ongeldige sleutel. Deze testdata worden na de GitHub-run vernietigd.
- Er is nog **geen** blijvende Medusa-database, Medusa-host, actieve provider, publieke checkout, order-event synchronization of klantbetaling. KAP Studio preview is niet vervangen.

## Architectuur

- KAP Storefront → Medusa Store API → Medusa checkout, order, tax, stock en fulfillment workflows.
- KAP Studio → Medusa Admin API voor commerciële data + KAP database voor helpdesk, interne notities, rollen en auditlog.
- **Medusa is straks de enige commerciële bron.** Bestaande `kap_orders`/`kap_products` en signed checkout hooks mogen niet in parallel blijven schrijven wanneer de productiecheckout op Medusa overgaat.
- Tot het moment van omzetting blijft de bestaande KAP orderdata ongemoeid en de Medusa Studio-informatie alleen-lezen.

## Lokaal draaien

Gebruik een **aparte** PostgreSQL database en Redis, nooit een GrowSocial of bestaande KAP Studio productie-database.

```bash
cd kap-medusa/apps/backend
cp .env.example .env
# Vul eigen development DATABASE_URL, REDIS_URL, JWT_SECRET en COOKIE_SECRET in
npm ci
npm run migrate
npm run build
npm run start
```

Medusa heeft Node.js >=22.23.4 nodig. `.env` blijft buiten Git. Test `http://localhost:9000/kap-readiness`, `http://localhost:9000/health` en admin login met een eigen beheeraccount. De KAP-readiness endpoint meldt bewust `checkout_enabled:false` en `payments_enabled:false`: opstart betekent nog geen verkoopvrijgave.

KAP Studio server environment (nooit als browser-variabelen):

```bash
KAP_MEDUSA_URL=https://de-echte-medusa-host/
KAP_MEDUSA_SECRET_API_KEY=<server-only secret API key>
```

Gebruik voor productie eigen lange secrets, een besloten backend host, aparte database met back-ups, Redis, bestandstorage en gecontroleerde CORS-origins. Voor productie moeten Medusa server- en workerprocessen afzonderlijk kunnen draaien (`WORKER_MODE=server` en `worker`). Laat de Admin UI aan voor inrichting; CI schakelt de UI alleen tijdens de smoke-test uit.

## Hergebruik van bestaand Supabase-project (preview)

De gekozen Supabase-projectcontainer heeft een bestaande `postgres` database, met oude (mogelijk externe) tabellen en accounts. **Medusa komt NIET in die database of het bestaande public-schema.** De afzonderlijke PostgreSQL-database `kap_commerce` is ingericht met eigenaar `kap_medusa_owner`. Deze eigenaar heeft op dit moment bewust `NOLOGIN`, totdat de veilige verbinding naar de host is gemaakt.

De GitHub-integratietest boot Medusa in een aparte PostgreSQL-database met een zelfstandige eigenaar, migreert Medusa, logt in en verifieert dat de oorspronkelijke database exact ongemoeid blijft.

**Belangrijke Supabase-beperkingen**: een extra database binnen een Supabase-project is geen afzonderlijk door het Dashboard beheerd project. Medusa is een gewone PostgreSQL-client; het gebruikt de Supabase Auth-, Storage- en REST-integraties niet. Voor een betrouwbare productieomgeving is een eigen beheer-/backupbeleid vereist en kan een dedicated project later verstandig zijn.

**Nog nodig vóór deployment**:

1. Kopieer in het **Supabase-project > Connect > Session pooler** de echte host/poort. Gebruik niet de IPv6-only directe `db.<ref>.supabase.co`-host vanaf Render; Render heeft geen outbound IPv6. Verzin het pooleradres niet op basis van regio. Gebruik poort 5432.
2. Maak `kap_medusa_owner` pas LOGIN met een gegenereerd sterk wachtwoord als het connection string-doel bekend is. Bewaar die DSN uitsluitend als Render server environment `DATABASE_URL`, met database `kap_commerce`, eigen rol, en SSL. Gebruik `NODE_ENV=production` en configureer Redis en secrets.
3. Deployment van Medusa via een **aparte** Render web service, met de Medusa build- en migrationstappen. Verbind daarna de read-only API-key in KAP Studio server environment; valideer login, order- en product-API, rolrechten en reversibele testdata.
4. De aparte database is nog NIET gemigreerd of verbonden met de live Medusa-service. Een groene GitHub-run bewijst de migratieaanpak, niet de externe hosting. Geen echte betalingen/checkout vrijgeven.

## Nog te bouwen vóór commerciële livegang

1. Definitieve producten en varianten (60/90 cm, SKU, EAN, energieklasse, afvoer/recirculatie, certificaten, handleiding, leverancier), regio NL, 21% btw, verzendmethodes en voorraad.
2. Store API-koppeling, browserwinkelwagen, verzend- en prijsberekening, iDEAL via gecontroleerde provider, payment-event idempotentie, bevestigingse-mails, bestelstatussen en retour-/refundflows.
3. Medusa order-ID-relatie met KAP Studio helpdesk, veilige gegevensrechten, event-reconciliatie en livegangschakelaar die de oude commerciële schrijfroute uitschakelt.
4. End-to-end test van betaalfouten, retries, dubbele callbacks, overselling, annuleringen, gedeeltelijke refunds, verzending, helpdesk, mails, database-backup en herstel.

Geen live checkout of verborgen betaalde hosting activeren op basis van alleen een groene technische CI-run.

Officiële bron: https://docs.medusajs.com/learn/installation
