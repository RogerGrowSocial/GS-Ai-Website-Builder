# KAP. — Operations & backoffice

**Current status: source code prepared, NOT deployed, NO production database, NO real orders, NO payment integration.**

Public storefront: https://kap-kitchen-preview-2026.onrender.com
This backoffice is OUTSIDE the public kap-preview directory and is intentionally NOT available to visitors.

## Features prepared
- Secure staff login through Supabase Auth, with JWT role and RLS authorization.
- Authenticated order list and payment-state separation.
- Order processing statuses, tickets with internal notes, product verification status and aggregated funnel reporting.
- No simulated real order records and no outbound emails from the dashboard.
- Source-controlled schema at schema.sql, not applied anywhere yet.

## Essential setup before any real usage
1. Select a dedicated Supabase organization and create a NEW project for KAP. only after approval of any subscription/compute costs. Do not reuse GrowSocial client or platform databases.
2. Review schema.sql and apply it as a migration to that dedicated project. Run security advisors and test anonymous, nonstaff and staff access. All sensitive tables must have RLS enabled.
3. Create staff accounts in Supabase Auth. Set app_metadata.kap_role through trusted Admin API to owner, operations or support. Never authorize using mutable user_metadata.
4. Require robust authentication, suitable MFA, secure session handling, and rate limiting. Grant the minimum required permissions.
5. Copy config.example.js to config.js with only the project URL and publishable key. NEVER expose a secret or service-role API key in the browser. Deploy as a separately secured private admin service or hostname.
6. Build a trusted server-side Mollie checkout handler that validates price, stock and VAT. Only a validated, idempotent Mollie payment webhook may mark orders paid or refunded. Browser code cannot create or pay orders directly.
7. Add a rate-limited authenticated support API. Public enquiries need spam protection; no public direct database writes of private tickets. Send support replies via an approved authenticated provider.
8. Confirm selling company, official product media, measurement drawings, technical documents, supplier conformity, stock/delivery, return policy, legal details and customer support BEFORE launching sales.
9. Connect GA4/GTM or a privacy-safe first-party collector separately. The storefront's dataLayer events exist only after explicit analytics consent, and currently do not reach an analytics provider. Purchase must be recorded only after verified payment, with transaction ID deduplication.

## Operating model
- Owner: finance, product approval, selling policies, pricing, oversight.
- Operations: orders, fulfillment, shipping, suppliers, refunds (not payment status manipulation).
- Support: ticket statuses and internal notes. No outbound email is sent by this dashboard.
- Product: draft -> supplier proof -> physical sample -> compliance review -> accurate media/specs -> active.
- Order: pending payment -> verified paid webhook -> preparing -> shipped -> delivered, or return/refund.
- Ticket: submitted via verified channel -> assigned -> response -> resolution; track first response and resolution time.

## KPIs
Unique item views, fit-check completions, add-to-cart rate, cart visits, checkout starts, verified paid orders, refunds, average order value, gross/contribution margin, first response time and resolution rate.

The current static storefront has provisional prices of EUR 475-495 and an intentionally disabled checkout. No Supabase records or customer transactions are created yet.
