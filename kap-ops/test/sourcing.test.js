import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('KAP sourcing data is isolated, protected and begins unverified',async()=>{
  const db=new PGlite();
  try {
    await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
    await db.query("INSERT INTO kap_products(sku,title,price_cents) VALUES('kap-schuin-zwart-60','KAP. Schuin 60 — Zwart',0)");
    await db.query("INSERT INTO kap_sourcing(sku,supplier) VALUES('kap-schuin-zwart-60','HyperSKU')");
    const r=(await db.query("SELECT * FROM kap_sourcing WHERE sku='kap-schuin-zwart-60'")).rows[0];
    assert.equal(r.workflow_status,'research');
    assert.equal(r.unit_cost_cents,null);
    assert.equal(r.shipping_cents,null);
    assert.equal(r.eu_documents_verified,false);
    assert.equal(r.single_unit_verified,false);
    assert.equal(r.api_mapping_verified,false);
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='kap_sourcing'")).rows[0].relrowsecurity,true);
    await assert.rejects(db.query("UPDATE kap_sourcing SET unit_cost_cents=-1 WHERE sku='kap-schuin-zwart-60'"));
    await assert.rejects(db.query("UPDATE kap_sourcing SET workflow_status='on_sale' WHERE sku='kap-schuin-zwart-60'"));
    await assert.rejects(db.query("INSERT INTO kap_sourcing(sku) VALUES('missing-product')"));
    await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  } finally {await db.close()}
});
