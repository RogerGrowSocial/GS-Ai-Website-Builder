# KAP. Studio — Operations backend

Independent KAP. order management and customer-care service. It does **not** connect to GrowSocial CRM, accounts, mailboxes or databases.

## Scope

- Password-protected KAP. staff dashboard with role separation.
- Persistent orders, order items, customer profiles and order timeline.
- Customer care tickets, internal notes, provider-controlled outgoing email, signed incoming-mail endpoint.
- Return records, status handling (tracking only; **no actual refunds**), answer templates, products, staff roles and audit log.
- Signed, replay-window-limited order webhook for future checkout integration. Checkout remains disabled in the current storefront.
- Health check and noindex administration pages.

## Deploy (independent Render service)

1. Create a **separate KAP. Postgres database** (do not reuse another company's database). For production, use a paid backed-up database; Render's free DB expires after 30 days.
2. Deploy `kap-ops/` as a Node web service with `npm ci` / `npm start`, Node 22+, health check `/health` and `PORT` assigned by Render. The existing KAP. static preview is **not** the backend.
3. Set `DATABASE_URL`, `NODE_ENV=production`, `KAP_ALLOWED_ORIGIN=https://<backend-host>`, `KAP_SHOP_ORIGIN` and initial `KAP_ADMIN_EMAIL`, `KAP_ADMIN_PASSWORD` (14+ characters). Never commit secrets. Admin created only if there are zero users; rotate/remove bootstrap password from Render environment after creation.
4. Open `/admin/` and verify login, order draft, ticket, note, return and staff permissions. The service fails its readiness check when the database is unavailable.
5. Connect a *KAP.-specific* verified outbound provider using `KAP_MAIL_API_KEY` and `KAP_FROM_EMAIL`. Configure inbound mail provider to POST a normalized JSON payload to `/api/webhooks/inbound-email`, signed with `KAP_INBOUND_SECRET`. Never point this at GrowSocial inboxes.
6. Configure the future checkout to POST orders only after products and prices are verified, with `KAP_ORDER_WEBHOOK_SECRET`. An independently verified provider adapter may post payment results to `/api/webhooks/payment` with `KAP_PAYMENT_WEBHOOK_SECRET`. Never expose either secret to the browser. No direct customer checkout is enabled by this service.

## Webhooks

The request header `x-kap-timestamp` is Unix milliseconds. `x-kap-signature` equals `sha256=<hex(HMAC_SHA256(secret, timestamp + '.' + raw JSON body))>`. The timestamp is valid for 5 minutes. Inbound emails require `message_id`, `from`, `subject`, `body`, optional `ticket_id`. Order payload: `external_reference`, `customer` (`email`, `first_name`, `last_name`), `items` (`sku`, `quantity`), optional `shipping_address`. Payment payload: `event_id`, `external_reference`, `status` (`paid`/`refunded`), exact `amount_cents` and `currency`. Payment providers' native webhook signatures must be verified by the adapter before the KAP. webhook is called.

Keep webhook secrets private. Integrations are **not connected** until independently configured and tested. Mail delivery is provider-accepted, not guaranteed inbox arrival.

## Local setup and tests

`npm ci && npm test`. Provide `DATABASE_URL` to run against a dedicated local Postgres. Startup creates the `kap_*` schema and three draft-only example products. Product prices remain illustrative.

No sample customers, messages or fake orders are inserted. The dashboard is empty until actual or manually entered data arrives.

### Free disposable demo

For a **preview only**, set `KAP_DEMO_MODE=true`, omit `DATABASE_URL`, and deploy on a free Render web service. This uses Node's lightweight in-memory SQLite adapter and creates clearly fictional example orders and tickets. Data is **permanently lost** on every restart/sleep/deploy. Mail delivery and all webhooks are disabled in demo mode. Never enter real customer information. This mode is not suitable for operations or production.
