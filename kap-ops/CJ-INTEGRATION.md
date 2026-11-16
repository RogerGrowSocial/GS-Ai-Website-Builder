# CJdropshipping → KAP. Studio (pre-launch)

Status: **technical adapter implemented, not yet connected to a real CJ account. No verified product or active checkout.**

## Architecture

KAP storefront = presentation only; draft `kap-schuin-zwart-60` is already visible and cannot be purchased.
KAP Studio = protected staff sourcing workspace and separate KAP operations database.
CJ API V2 = third-party catalog, variant stock, freight estimates, and sourcing requests. CJ does not become the KAP customer or payment database.

- `GET /api/cj/status` — owner/manager authenticated configuration, no secret values.
- `GET /api/cj/search?q=60cm%20angled%20cooker%20hood` — searches real CJ product list V2.
- `GET /api/cj/product?pid=...` and `/api/cj/variants?pid=...` — catalog details and CJ variants.
- `GET /api/cj/stock?vid=...` — live CJ stock inquiry, not reserved stock.
- `POST /api/cj/freight` — estimate for 1 unit to NL. Requires real CJ variant ID and warehouse origin.
- `POST /api/cj/attach` — attaches a catalog candidate to KAP sourcing record and **resets all compliance/price/availability checks to false**. Never publishes stock.
- `POST /api/cj/sourcing/request` — **explicit staff action** to create a REAL sourcing request; requires public HTTPS product photo, persistent KAP DB, and CJ key. No purchase. A repeat request is blocked.
- `GET /api/cj/sourcing/status?sku=kap-schuin-zwart-60` — query an existing CJ source ID.

All CJ operations are server-side, require an authenticated KAP owner/manager, and mutating calls use KAP's session-bound CSRF validation. CJ API credentials never reach the browser.

## Connect CJ safely

1. In CJdropshipping: Apps → Install App → Others → API; then Personal Center → API → Add API, choose Type **API Key**. Official docs: https://developers.cjdropshipping.com/en/api/api2/api/auth.html
2. Add the key on the KAP Studio Render server only as `CJ_API_KEY`; do not paste it into GitHub, the public storefront, JavaScript, or a chat.
3. Restart/redeploy the backend, sign in at `https://kap-studio-preview-2026.onrender.com/admin/`, open **Inkoop & leveranciers**, verify that CJ shows configured and use the built-in search.
4. If catalog search finds no exact 60cm black slanted glass hood, use the explicit sourcing request. The product image must have a **public HTTPS URL**; private local screenshots cannot be sent directly as a product image.
5. A product may be approved only after supplier source ID + exact CJ product/variant SKU + landed NL shipping + completely **logo-free** sample and **exact-model** EU DoC, test reports, EPREL/energy details, WEEE/GPSR responsibilities, and fulfilled single-unit order have been evidenced.

## Hard safeguards

- An API search result's `hasCECertification` is only a **CJ claim**, never sufficient EU compliance proof.
- Estimated stock and logistics do not imply Dutch deliverability or an agreed landed price; quotes are in USD.
- Mapping a CJ catalog candidate does **not** mark it approved, create a payment, or publish checkout.
- No CJ order-creation, balance-payment or refund endpoints are exposed in this phase.
- Existing KAP. Studio **Medusa** adapter remains read-only; do not point live Medusa orders into the local KAP order webhook because it can double-handle orders.
- KAP Studio demo database (`KAP_DEMO_MODE=true`) is volatile and **not suitable** for real customer/order records. Production needs durable separate PostgreSQL, HTTPS, backups, validated KAP mail, verified legal pages, and an independently tested commerce/checkout flow.

## What cannot be claimed yet

- The target product is not sourced in CJ, has no CJ PID/VID, no confirmed prices, no proof that it is unbranded and no exact-model compliance documentation.
- The CJ API is not connected until `CJ_API_KEY` exists on the server and a real authenticated request is verified.
- End-to-end live fulfilment, webhooks, payment processing, and actual tracking have not been verified.
- No customer purchases are enabled.

## Local tests

From `kap-ops/`: `npm ci && npm run check && npm test`. The CJ tests use mocked HTTP and cannot prove external CJ account reachability.
