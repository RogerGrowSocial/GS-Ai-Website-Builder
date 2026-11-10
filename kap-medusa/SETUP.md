# KAP — Medusa v2 commerce-service

## Architectuur (besloten)

KAP Storefront → Medusa Store API → Medusa order/stock/payment/return workflows.
KAP Studio → Medusa Admin API (read-only views) + eigen customer-care database.

**Een enkele handelsbron**: Medusa wordt eigenaar van productvarianten, tarieven, belasting, voorraad, betalingen, retouren, verzendingen en orders. De bestaande `kap_orders`, `kap_products` en oudere signed checkout hooks mogen nooit parallel productieorders accepteren wanneer Medusa live is. KAP Studio houdt alleen klantcontact, interne notities, teamrollen en audit-events. Echte bestellingen in Studio worden uitsluitend uit Medusa gelezen.

## Installatie

Installeer uitsluitend via de officiële Medusa v2 starter, niet via gekopieerde broncode of een onbevestigde dependencyversie:

```bash
npx create-medusa-app@latest kap-commerce
```

Kies zonder extra storefront: de bestaande KAP Storefront blijft de frontend. Medusa v2 vereist een geïsoleerde PostgreSQL database en voor productie Redis. Maak geen verbinding met GrowSocial databases, klantaccounts of inboxen.

## Veiligheid en omgeving

Voor lokale ontwikkeling is één Medusa-instantie in shared worker-modus voldoende. Voor productie:

- Separate server- en worker-processen voor Medusa, met dezelfde applicatieversie.
- Dedicated backed-up PostgreSQL en Redis, secrets in host-environment en passende S3-compatible file storage.
- Configureer `DATABASE_URL`, `REDIS_URL`, `COOKIE_SECRET`, `JWT_SECRET`, `ADMIN_CORS`, `AUTH_CORS`, `STORE_CORS` en `MEDUSA_BACKEND_URL` volgens officiële deployment-instructies.
- Voer `medusa db:migrate` uit vóór opstart; monitor beide processen en controleer `/health`.
- Maak een servicegebruiker en secret API key in Medusa Admin met de kleinst mogelijke bevoegdheden. Verbind de KAP Studio backend via `KAP_MEDUSA_URL` en `KAP_MEDUSA_SECRET_API_KEY`; nooit via browser of broncode.
- Koppel echte Mollie/iDEAL pas na gecontroleerde providerinstallatie en onafhankelijke test van signature checks, server-side prijsberekening en webhook-idempotentie.

## Productie-overgang — verplicht

1. Test lokale Medusa installatie met alleen fictieve producten; leg de productvelden vast voor KAP afzuigkappen (SKU, 60/90 cm, finish, afmetingen, afvoer/recirculatie, energieklasse, EAN, handleiding, garantie).
2. Maak de Store API cart- en checkout-integratie, met correcte BTW, verzendkosten, orderbevestiging en voorraadreservering. **Geen browser-side orderbedragen vertrouwen.**
3. Verplaats read-only orderdetails en ordergeschiedenis naar KAP Studio, gekoppeld aan servicecases met Medusa order IDs. Beperk inzage op rollen en log toegang.
4. Bouw een idempotente event/inbox of webhook-consumer voor klantmeldingen; verwerk retries, out-of-order events en periodieke reconciliatie. Laat Medusa de enige instantie blijven die voorraad en betalingen muteert.
5. Test dubbele betalingen, ontbrekende webhooks, geweigerde betaling, overselling, annulering, gedeeltelijke verzending, refund en retour, e-mailaflevering, restore van back-up en rolrechten. Pas daarna de checkout expliciet vrijgeven.

## Huidige status

Dit is een **ontwikkelbranch**, geen actieve installatie. De Commerce-engine in KAP Studio is read-only en maximaal 30 resultaten per categorie; totalen/waarschuwingen maken gedeeltelijke overzichten zichtbaar. Medusa-server, Redis, provider, checkout en echte verkoopproducten zijn nog niet gekoppeld. De huidige KAP preview blijft beschermd. Een betaalde hostingdienst of echte klantbetaling is **niet** opgestart.

Officiële documentatie: https://docs.medusajs.com/learn/installation en https://docs.medusajs.com/learn/deployment/general
