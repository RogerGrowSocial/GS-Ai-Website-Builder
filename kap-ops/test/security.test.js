import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { passhash, passcheck, webhookVerified, clean, positive, validEmail, server } from '../server.js';

test('password verification rejects incorrect passwords',()=>{
  const value=passhash('LongPrivatePassword123!');
  assert.ok(passcheck('LongPrivatePassword123!',value));
  assert.equal(passcheck('WrongPassword!',value),false);
  assert.equal(passcheck('any','broken-hash'),false);
});
test('input sanitation is bounded and email validation is strict',()=>{
  assert.equal(clean('  abcdef ',3),'abc');
  assert.equal(validEmail('customer@example.com'),true);
  assert.equal(validEmail('bad@'),false);
  assert.equal(positive(2),true);
  assert.equal(positive(-1),false);
});
test('signed webhook verifies signature, timestamp and rejects tampering',()=>{
  process.env.KAP_ORDER_WEBHOOK_SECRET='test-only-secret';
  const raw=Buffer.from('{"hello":"world"}');
  const timestamp=Date.now();
  const signature=crypto.createHmac('sha256','test-only-secret').update(String(timestamp)+'.').update(raw).digest('hex');
  assert.doesNotThrow(()=>webhookVerified({headers:{'x-kap-timestamp':String(timestamp),'x-kap-signature':'sha256='+signature}},raw,'KAP_ORDER_WEBHOOK_SECRET'));
  assert.throws(()=>webhookVerified({headers:{'x-kap-timestamp':String(timestamp),'x-kap-signature':'sha256='+signature}},Buffer.from('tampered'),'KAP_ORDER_WEBHOOK_SECRET'));
  assert.throws(()=>webhookVerified({headers:{'x-kap-timestamp':String(timestamp-6*60*1000),'x-kap-signature':'sha256='+signature}},raw,'KAP_ORDER_WEBHOOK_SECRET'));
  delete process.env.KAP_ORDER_WEBHOOK_SECRET;
});
test('static admin includes security headers and disabled database reports not ready',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=server.address().port;
    const page=await fetch(`http://127.0.0.1:${port}/admin/`);
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.match(await page.text(),/KAP\. Studio/);
    const health=await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status,503);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
