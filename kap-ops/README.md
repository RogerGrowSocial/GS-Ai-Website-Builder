# KAP. Studio — Operations backend

Independent KAP. order management and customer-care service. It does **not** connect to GrowSocial CRM, accounts, mailboxes or databases.

## Scope

- Password-protected KAP. staff dashboard with role separation.
- Persistent orders, order items, customer profiles and order timeline.
- Customer care tickets, internal notes, provider-controlled outgoing email, signed incoming-mail endpoint.
- Return records, status handling (tracking only; **no actual refunds**), answer templates, products, staff roles and audit log.
- Signed, replay-window-limited order webhook for future checkout integration. Checkout remains disabled in the current storefront.
- Staff-only fictional checkout/payment sandbox, with order and shipment email previews, support ticket and return walkthrough.
- Database-backed notification outbox with one confirmation per order/event type; optional delivery via an independently configured KAP. sender.
- Health check and noindex administration pages.
- Read-only **Livegang** checklist and unit-economics calculator (NL 21% VAT assumption). Nothing in the calculator is stored or billed.

## Deploy (independent Render service)

1. Create a **separate KAP. Postgres database** (do not reuse another company's database). For production, use a paid backed-up database; Render's free DB expires after 30 days.
2. Deploy `kap-ops/` as a Node web service with `npm ci` / `npm start`, Node 22+, health check `/health` and `PORT` assigned by Render. The existing KAP. static preview is **not** the backend.
3. Set `DATABASE_URL`, `NODE_ENV=production`, `KAP_ALLOWED_ORIGIN=https://<backend-host>`, `KAP_SHOP_ORIGIN` and initial `KAP_ADMIN_EMAIL`, `KAP_ADMIN_PASSWORD` (14+ characters). Never commit secrets. Admin created only if there are zero users; rotate/remove bootstrap password from Render environment after creation.
4. Open `/admin/` and verify login, order draft, ticket, note, return and staff permissions. The service fails its readiness check when the database is unavailable.
5. Connect a *KAP.-specific* verified outbound provider using `KAP_MAIL_API_KEY` and `KAP_FROM_EMAIL`. Configure inbound mail provider to POST a normalized JSON payload to `/api/webhooks/inbound-email`, signed with `KAP_INBOUND_SECRET`. Never point this at GrowSocial inboxes.
6. Configure the future checkout to POST orders only after products and prices are verified, with `KAP_ORDER_WEBHOOK_SECRET`. An independently verified provider adapter may post payment results to `/api/webhooks/payment` with `KAP_PAYMENT_WEBHOOK_SECRET`. Never expose either secret to the browser. No direct customer checkout is enabled by this service.

### Order flow and customer notifications

- A verified payment event transitions the matching order to paid/processing and records the Dutch order-confirmation in `kap_order_notifications`. Duplicate payment events must not create extra notifications.
- When an order transitions to shipped, a shipping confirmation is recorded with the tracking reference, if provided. The order detail shows its notifications and linked support/return records.
- The notification outbox is persistent **only with a real `DATABASE_URL`**. With `KAP_MAIL_API_KEY` and `KAP_FROM_EMAIL` from a verified KAP.-only sender, the application can attempt live email delivery. Until then, real-mode notifications remain queued and cannot be presented as delivered. A provider acceptance is not proof of recipient inbox delivery.
- Returns are handled as requests and internal status changes; no automatic carrier label, refund or payment-provider credit is issued. Shipping tracking is manually recorded; no live carrier integration exists yet.

### Persistent, free staff test checkout

With the real `DATABASE_URL`, set `KAP_TEST_CHECKOUT_ENABLED=true` to expose **Testbestelling** to logged-in owners/managers. It creates only fictional `.invalid` customers, simulated payments and **never-sent** email previews. All sandbox data survives server restarts and deployments, but is marked `source=sandbox` and excluded from real-order/real-revenue dashboard KPIs. The last test order can be resumed after a browser refresh. No products, real inventory, iDEAL charges, mail credits, refunds, carrier labels or real shipping integrations are used. Public checkout stays disabled. Turn the flag off to hide new tests without deleting historical test records.

All `kap_*` tables have PostgreSQL Row Level Security enabled and no policies allowing public API roles. The server's dedicated database connection is still required for internal operations. Keep the Supabase Data API disabled.

## Webhooks

The request header `x-kap-timestamp` is Unix milliseconds. `x-kap-signature` equals `sha256=<hex(HMAC_SHA256(secret, timestamp + '.' + raw JSON body))>`. The timestamp is valid for 5 minutes. Inbound emails require `message_id`, `from`, `subject`, `body`, optional `ticket_id`. Order payload: `external_reference`, `customer` (`email`, `first_name`, `last_name`), `items` (`sku`, `quantity`), optional `shipping_address`. Payment payload: `event_id`, `external_reference`, `status` (`paid`/`refunded`), exact `amount_cents` and `currency`. Payment providers' native webhook signatures must be verified by the adapter before the KAP. webhook is called.

Keep webhook secrets private. Integrations are **not connected** until independently configured and tested. Mail delivery is provider-accepted, not guaranteed inbox arrival.

## Local setup and tests

`npm ci && npm test`. Provide `DATABASE_URL` to run against a dedicated local Postgres. Startup creates the `kap_*` schema and three draft-only example products. Product prices remain illustrative.

No sample customers, messages or fake orders are inserted. The dashboard is empty until actual or manually entered data arrives.

### Product release and livegang controls

- All catalog products begin as `draft`, with zero stock. The admin cannot change a product to `ready` unless its SKU is independently listed in `KAP_APPROVED_PRODUCT_SKUS` **and** supplier, product safety, e-waste and pricing flags have been attested. Demo mode **always blocks** this transition.
- The `GET /api/launch-readiness` endpoint powers the owner-facing checklist. It separates product validation, technology and consumer compliance; checkout deliberately remains blocked regardless of checklist values.
- Readiness indicators for supplier, safety, e-waste, pricing, company details and shipping start as incomplete. Following real-world verification, the operator may set `KAP_SUPPLIER_VERIFIED`, `KAP_PRODUCT_SAFETY_VERIFIED`, `KAP_WEEE_VERIFIED`, `KAP_PRICES_VERIFIED`, `KAP_LEGAL_VERIFIED`, and `KAP_SHIPPING_VERIFIED` to `true`. **These flags represent a manual attestation, not legal or technical proof.** Do not set them in a preview or without evidence.
- Pricing estimates are always explicitly illustrative. The margin calculator requires a supplied actual cost and deducts Dutch 21% VAT from the indicative selling price, plus direct-cost estimates. It excludes fixed overhead, marketing, and profit tax.
- Never enable real orders on the free demo. Before opening checkout, implement and end-to-end test a verified payment adapter, durable backed-up storage, actual product documents, legal pages and real support communication.

### Free disposable demo

For a **preview only**, set `KAP_DEMO_MODE=true`, omit `DATABASE_URL`, and deploy on a free Render web service. This uses Node's lightweight in-memory SQLite adapter and creates clearly fictional example orders and tickets. Data is **permanently lost** on every restart/sleep/deploy. Mail delivery and all webhooks are disabled in demo mode. Never enter real customer information. This mode is not suitable for operations or production.

Inside the authenticated Studio, open **Testbestelling**. This allows staff to simulate the complete order-management workflow with a draft product and a fictional `.invalid` email: create an order, simulate payment (no charge), view a simulated order-confirmation email, mark the order shipped with test tracking, view the shipping confirmation, open a service ticket and register a return. The two email messages are **previews only**; they are never sent in demo mode. This does **not** turn on the public storefront checkout or prove the real bank/payment-provider integration. The automated test suite separately verifies the signed-payment webhook and database-backed notification flow.
