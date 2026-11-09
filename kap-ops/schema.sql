CREATE TABLE IF NOT EXISTS kap_users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('owner','manager','support','fulfillment')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES kap_users(id) ON DELETE CASCADE,
 csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_customers (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, first_name text NOT NULL DEFAULT '',
 last_name text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', address jsonb NOT NULL DEFAULT '{}'::jsonb,
 tags text[] NOT NULL DEFAULT '{}'::text[], created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_products (
 sku text PRIMARY KEY, title text NOT NULL, price_cents integer NOT NULL CHECK(price_cents >= 0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','archived')),
 stock_quantity integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_orders (
 id uuid PRIMARY KEY, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 customer_id uuid NOT NULL REFERENCES kap_customers(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','processing','shipped','delivered','cancelled')),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','pending','paid','partially_refunded','refunded')),
 fulfillment_status text NOT NULL DEFAULT 'unfulfilled' CHECK(fulfillment_status IN ('unfulfilled','partial','fulfilled','returned')),
 currency char(3) NOT NULL DEFAULT 'EUR', subtotal_cents integer NOT NULL DEFAULT 0,
 shipping_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL DEFAULT 0,
 source text NOT NULL DEFAULT 'manual', external_reference text UNIQUE,
 shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
 tracking_code text NOT NULL DEFAULT '', carrier text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_order_items (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES kap_orders(id) ON DELETE CASCADE,
 sku text NOT NULL, title text NOT NULL, quantity integer NOT NULL CHECK(quantity > 0),
 unit_price_cents integer NOT NULL CHECK(unit_price_cents >= 0), line_total_cents integer NOT NULL CHECK(line_total_cents >= 0)
);
CREATE TABLE IF NOT EXISTS kap_tickets (
 id uuid PRIMARY KEY, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 customer_id uuid REFERENCES kap_customers(id), order_id uuid REFERENCES kap_orders(id),
 subject text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','resolved','closed')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
 category text NOT NULL DEFAULT 'question', assigned_to uuid REFERENCES kap_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_messages (
 id uuid PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES kap_tickets(id) ON DELETE CASCADE,
 direction text NOT NULL CHECK(direction IN ('inbound','outbound','note')),
 body text NOT NULL, sender text NOT NULL DEFAULT '', delivery_status text NOT NULL DEFAULT 'stored',
 external_id text UNIQUE, created_by uuid REFERENCES kap_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_returns (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES kap_orders(id),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','received','rejected','closed')),
 reason text NOT NULL, resolution text NOT NULL DEFAULT 'pending' CHECK(resolution IN ('pending','replacement','refund','no_refund')),
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_events (
 id uuid PRIMARY KEY, actor_id uuid REFERENCES kap_users(id), entity_type text NOT NULL,
 entity_id uuid, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_templates (
 id uuid PRIMARY KEY, title text NOT NULL, category text NOT NULL DEFAULT 'general',
 subject text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS kap_webhook_receipts (
 id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kap_orders_created_idx ON kap_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS kap_orders_customer_idx ON kap_orders(customer_id);
CREATE INDEX IF NOT EXISTS kap_tickets_status_idx ON kap_tickets(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS kap_messages_ticket_idx ON kap_messages(ticket_id,created_at);
CREATE INDEX IF NOT EXISTS kap_events_created_idx ON kap_events(created_at DESC);
