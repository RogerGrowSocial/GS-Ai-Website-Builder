// Server-only Supabase PostgreSQL connection configuration.
// Never use the Supabase Data API for Medusa's database migrations.
export function kapDatabaseUrl(env = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  const host = env.KAP_PG_POOLER_HOST ?? '';
  const ref = env.KAP_SUPABASE_PROJECT_REF ?? '';
  const password = env.KAP_PG_ROLE_PASSWORD ?? '';
  if (!host || !ref || !password) {
    throw new Error('Missing KAP Medusa PostgreSQL connection configuration');
  }
  if (!/^aws-[0-9]+-eu-central-1\.pooler\.supabase\.com$/.test(host) ||
      !/^[a-z0-9]{20}$/.test(ref) || password.length < 32) {
    throw new Error('Invalid KAP Medusa PostgreSQL connection configuration');
  }
  const url = new URL('postgresql://' + host);
  url.username = 'kap_medusa_owner.' + ref;
  url.password = password;
  url.port = '5432';
  url.pathname = '/kap_commerce';
  url.searchParams.set('sslmode', 'require');
  return url.toString();
}
