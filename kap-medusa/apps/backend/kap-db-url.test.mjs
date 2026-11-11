import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kapDatabaseUrl } from './kap-db-url.mjs';

const env = {
 KAP_PG_POOLER_HOST:'aws-0-eu-central-1.pooler.supabase.com',
 KAP_SUPABASE_PROJECT_REF:'tjxzqyfzkqsspywrvowl',
 KAP_PG_ROLE_PASSWORD:'LongTempTestPasswordOnly0123456789/=?#',
};

test('builds a Supabase session pooler URL scoped to separate KAP database', () => {
 const raw=kapDatabaseUrl(env),url=new URL(raw);
 assert.equal(url.hostname,env.KAP_PG_POOLER_HOST);
 assert.equal(url.port,'5432');
 assert.equal(url.pathname,'/kap_commerce');
 assert.equal(url.username,'kap_medusa_owner.tjxzqyfzkqsspywrvowl');
 assert.equal(url.password,encodeURIComponent(env.KAP_PG_ROLE_PASSWORD));
 assert.equal(url.searchParams.get('sslmode'),'require');
 assert.ok(!raw.includes(env.KAP_PG_ROLE_PASSWORD));
});
test('rejects guessed unrelated hosts, missing secrets and invalid project IDs', () => {
 for (const patch of [
 { KAP_PG_POOLER_HOST:'evil.example.com' }, { KAP_PG_POOLER_HOST:'aws-0-us-east-1.pooler.supabase.com' },
 { KAP_PG_POOLER_HOST:'127.0.0.1' }, { KAP_SUPABASE_PROJECT_REF:'invalid' },
 { KAP_PG_ROLE_PASSWORD:'short' },
 ]) assert.throws(()=>kapDatabaseUrl({...env,...patch}));
 assert.throws(()=>kapDatabaseUrl({}));
});
test('plain DATABASE_URL remains compatible with isolated CI Postgres',()=>{
 assert.equal(kapDatabaseUrl({DATABASE_URL:'postgresql://test:test@localhost:5432/kap_ci'}),
 'postgresql://test:test@localhost:5432/kap_ci');
});
