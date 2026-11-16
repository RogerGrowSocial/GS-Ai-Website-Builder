// Server-only, read-only Medusa v2 Admin API adapter. Never send its secret
// API token to the KAP. browser or use it to mutate commerce data.
const error = (code, message) => Object.assign(new Error(message), { code });

export function medusaConfigured(env = process.env) {
  return Boolean(env.KAP_MEDUSA_URL && env.KAP_MEDUSA_SECRET_API_KEY);
}

export function medusaBaseUrl(env = process.env) {
  if (!medusaConfigured(env)) throw error(503, 'Medusa is nog niet gekoppeld');
  let parsed;
  try { parsed = new URL(env.KAP_MEDUSA_URL); }
  catch { throw error(503, 'Medusa-serveradres is ongeldig'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((!local && parsed.protocol !== 'https:') ||
      (local && !['http:', 'https:'].includes(parsed.protocol)) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw error(503, 'Medusa-serveradres moet een veilige basis-URL zijn');
  }
  return parsed;
}

export function medusaPage(raw = 0) {
  const value = typeof raw === 'number' ? raw : (/^(0|[1-9][0-9]*)$/.test(raw) ? Number(raw) : NaN);
  if (!Number.isSafeInteger(value) || value < 0 || value > 999990 || value % 30 !== 0) {
    throw error(400, 'Ongeldige paginering');
  }
  return value;
}

export async function medusaAdminRead(resource, { env = process.env, request = fetch, offset = 0 } = {}) {
  const allowed = { orders: '/admin/orders?limit=30', products: '/admin/products?limit=30' };
  if (!Object.hasOwn(allowed, resource)) throw error(400, 'Onbekende Medusa-resource');
  const url = new URL(allowed[resource], medusaBaseUrl(env));
  url.searchParams.set('offset', String(medusaPage(offset)));
  if (resource === 'orders') url.searchParams.set('order', '-created_at');
  let response;
  try {
    response = await request(url, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: 'Basic ' + env.KAP_MEDUSA_SECRET_API_KEY,
        Accept: 'application/json'
      }
    });
  } catch {
    throw error(502, 'Medusa is momenteel niet bereikbaar');
  }
  if (!response.ok) throw error(502, 'Medusa kon de gegevens niet ophalen');
  try { return await response.json(); }
  catch { throw error(502, 'Medusa gaf een ongeldig antwoord'); }
}

// Medusa v2 API totals are in major currency units (e.g. EUR 475.00).
// KAP. UI historically displays integer cents. Do not reinterpret totals
// as cents or use these read-model values for creating payments/refunds.
export function medusaMoneyToCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) ||
      amount < 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100);
}

export function medusaOrderSummary(order) {
  return {
    id: String(order.id ?? ''), display_id: order.display_id ?? null,
    email: String(order.email ?? ''), created_at: order.created_at ?? null,
    currency: String(order.currency_code ?? '').toUpperCase(),
    total_cents: medusaMoneyToCents(order.total),
    payment_status: String(order.payment_status ?? 'unknown'),
    fulfillment_status: String(order.fulfillment_status ?? 'unknown')
  };
}
