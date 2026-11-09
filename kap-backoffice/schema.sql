-- KAP. e-commerce backoffice schema (DESIGN-ONLY; not applied to any database).
-- Install only in a NEW, dedicated KAP. Supabase project after owner approves organization/cost.
-- NEVER attach this to an unrelated GrowSocial project.
-- Access: Auth JWT app_metadata.kap_role assigned ONLY by server/admin ('owner','operations','support').
-- Storefront checkout/payment webhooks require a trusted server and MUST use a secret key server-side.
-- Product PII is never public. Frontend publishable key + RLS only.

create table if not exists public.kap_products (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 title text not null,
 sku text unique,
 supplier_reference text,
 description text,
 price_cents integer not null default 0 check(price_cents>=0),
 cost_cents integer check(cost_cents is null or cost_cents>=0),
 currency text not null default 'EUR' check(currency='EUR'),
 status text not null default 'draft' check(status in ('draft','review','active','archived')),
 compliance_verified boolean not null default false,
 product_media_verified boolean not null default false,
 width_mm integer check(width_mm is null or width_mm>0),
 depth_mm integer check(depth_mm is null or depth_mm>0),
 clearance_mm integer check(clearance_mm is null or clearance_mm>0),
 noise_db_min numeric,
 noise_db_max numeric,
 airflow_m3h numeric,
 supports_recirc boolean,
 filter_reference text,
 energy_label text,
 manual_url text,
 stock_quantity integer not null default 0 check(stock_quantity>=0),
 supplier_lead_days integer check(supplier_lead_days is null or supplier_lead_days>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint kap_active_products_verified check(status <> 'active' or compliance_verified = true)
);
create index if not exists kap_products_status_idx on public.kap_products(status);

create table if not exists public.kap_customers (
 id uuid primary key default gen_random_uuid(),
 email text not null,
 full_name text,
 phone text,
 shipping_address jsonb,
 billing_address jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists kap_customers_email_idx on public.kap_customers(lower(email));

create table if not exists public.kap_orders (
 id uuid primary key default gen_random_uuid(),
 order_number text not null unique,
 customer_id uuid references public.kap_customers(id),
 status text not null default 'pending_payment'
   check(status in ('pending_payment','paid','preparing','shipped','delivered','cancelled','refunded')),
 payment_status text not null default 'unpaid'
   check(payment_status in ('unpaid','pending','paid','failed','refunded','partially_refunded')),
 currency text not null default 'EUR' check(currency='EUR'),
 subtotal_cents integer not null check(subtotal_cents>=0),
 tax_cents integer not null check(tax_cents>=0),
 shipping_cents integer not null default 0 check(shipping_cents>=0),
 total_cents integer not null check(total_cents>=0),
 payment_provider text,
 payment_reference text unique,
 payment_confirmed_at timestamptz,
 internal_note text,
 placed_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint kap_order_total_check check(total_cents=subtotal_cents+tax_cents+shipping_cents),
 constraint kap_payment_status_consistency check (
  (status in ('paid','preparing','shipped','delivered') and payment_status='paid')
  or (status='refunded' and payment_status in ('refunded','partially_refunded'))
  or status in ('pending_payment','cancelled')
 )
);
create index if not exists kap_orders_status_created_idx on public.kap_orders(status,placed_at desc);
create index if not exists kap_orders_customer_idx on public.kap_orders(customer_id);

create table if not exists public.kap_order_items (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.kap_orders(id) on delete cascade,
 product_id uuid references public.kap_products(id),
 sku_snapshot text,
 title_snapshot text not null,
 quantity integer not null check(quantity>0),
 unit_price_cents integer not null check(unit_price_cents>=0),
 vat_rate numeric(5,2) not null default 21 check(vat_rate>=0 and vat_rate<=100),
 line_total_cents integer not null check(line_total_cents>=0),
 constraint kap_order_items_total_check check(line_total_cents=unit_price_cents*quantity)
);
create index if not exists kap_order_items_order_idx on public.kap_order_items(order_id);

create table if not exists public.kap_shipments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.kap_orders(id) on delete cascade,
 carrier text,
 tracking_code text,
 tracking_url text,
 status text not null default 'pending' check(status in ('pending','label_created','in_transit','delivered','exception')),
 shipped_at timestamptz,
 delivered_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists kap_shipments_order_idx on public.kap_shipments(order_id);

create table if not exists public.kap_support_tickets (
 id uuid primary key default gen_random_uuid(),
 subject text not null,
 customer_id uuid references public.kap_customers(id),
 order_id uuid references public.kap_orders(id),
 email text not null,
 category text not null default 'general'
   check(category in ('general','product','order','delivery','return','warranty')),
 status text not null default 'open'
   check(status in ('open','in_progress','waiting_customer','resolved','closed')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 assigned_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists kap_tickets_status_updated_idx on public.kap_support_tickets(status,updated_at desc);

create table if not exists public.kap_ticket_messages (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.kap_support_tickets(id) on delete cascade,
 direction text not null check(direction in ('customer','staff_internal','staff_sent')),
 body text not null,
 author_id uuid references auth.users(id),
 provider_message_id text,
 created_at timestamptz not null default now(),
 constraint kap_sent_message_reference check(direction <> 'staff_sent' or provider_message_id is not null)
);
create index if not exists kap_ticket_messages_ticket_idx on public.kap_ticket_messages(ticket_id,created_at);

create table if not exists public.kap_daily_metrics (
 day date not null,
 event_name text not null check(event_name in ('page_view','view_item','view_item_list','add_to_cart','view_cart','begin_checkout','purchase','refund','fit_check_completed')),
 total_count integer not null default 0 check(total_count>=0),
 total_value_cents bigint not null default 0,
 primary key(day,event_name)
);

-- Deny by default and enforce verified staff roles from immutable-by-user app_metadata.
alter table public.kap_products enable row level security;
alter table public.kap_customers enable row level security;
alter table public.kap_orders enable row level security;
alter table public.kap_order_items enable row level security;
alter table public.kap_shipments enable row level security;
alter table public.kap_support_tickets enable row level security;
alter table public.kap_ticket_messages enable row level security;
alter table public.kap_daily_metrics enable row level security;

revoke all on public.kap_products,public.kap_customers,public.kap_orders,public.kap_order_items,
 public.kap_shipments,public.kap_support_tickets,public.kap_ticket_messages,public.kap_daily_metrics
 from anon,authenticated;

grant select on public.kap_products to anon,authenticated;
grant insert,update,delete on public.kap_products to authenticated;
create policy kap_products_public_active on public.kap_products for select to anon
 using (status='active' and compliance_verified=true and product_media_verified=true);
create policy kap_products_staff_select on public.kap_products for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support') or (status='active' and compliance_verified and product_media_verified));
create policy kap_products_staff_insert on public.kap_products for insert to authenticated
 with check ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations'));
create policy kap_products_staff_update on public.kap_products for update to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations'))
 with check ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations'));
create policy kap_products_owner_delete on public.kap_products for delete to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') = 'owner');

-- All customer and order records are staff-only.
grant select on public.kap_customers,public.kap_orders,public.kap_order_items,
 public.kap_shipments,public.kap_support_tickets,public.kap_ticket_messages,public.kap_daily_metrics
 to authenticated;
create policy kap_customers_staff on public.kap_customers for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));
create policy kap_orders_staff on public.kap_orders for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));
create policy kap_order_items_staff on public.kap_order_items for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));
create policy kap_shipments_staff on public.kap_shipments for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));
create policy kap_tickets_staff on public.kap_support_tickets for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));
create policy kap_messages_staff on public.kap_ticket_messages for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));
create policy kap_metrics_staff on public.kap_daily_metrics for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));

-- Staff may update operational status but never a paid amount or a verified payment status.
grant update (status,internal_note,updated_at) on public.kap_orders to authenticated;
create policy kap_orders_ops_update on public.kap_orders for update to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations'))
 with check ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations'));

grant update (status,priority,assigned_user_id,updated_at) on public.kap_support_tickets to authenticated;
create policy kap_tickets_ops_update on public.kap_support_tickets for update to authenticated
 using ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'))
 with check ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support'));

grant insert on public.kap_ticket_messages to authenticated;
create policy kap_internal_note_insert on public.kap_ticket_messages for insert to authenticated
 with check ((auth.jwt()->'app_metadata'->>'kap_role') in ('owner','operations','support')
 and direction='staff_internal' and author_id=(select auth.uid()));

-- Order payment confirmation, refunds, support email delivery and customer creation:
-- ONLY from a trusted backend with authenticated payment webhook, never browser-originated.
-- Even authenticated staff cannot directly write paid-state or create customer orders via Data API.
