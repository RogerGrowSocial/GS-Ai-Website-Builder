import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('postgres schema creates all isolated KAP tables with safe constraints',async()=>{
  const db=new PGlite();
  try{
    await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
    const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
    assert.ok(['kap_users','kap_sessions','kap_customers','kap_products','kap_orders','kap_order_items','kap_tickets','kap_messages','kap_returns','kap_events','kap_templates','kap_webhook_receipts'].every(x=>tables.includes(x)));
    await db.query("INSERT INTO kap_products(sku,title,price_cents) VALUES('test','Test',10000)");
    await assert.rejects(db.query("INSERT INTO kap_products(sku,title,price_cents) VALUES('invalid','Test',-1)"));
    await assert.rejects(db.query("UPDATE kap_products SET status='sold' WHERE sku='test'"));
    await db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  }finally{await db.close()}
});
