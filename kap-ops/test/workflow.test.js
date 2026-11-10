import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { server, migrate, setDatabaseForTests } from '../server.js';

test('end-to-end order, customer care, return and authorization workflows',async()=>{
  process.env.NODE_ENV='test';
  process.env.KAP_ADMIN_EMAIL='owner@kap.example';
  process.env.KAP_ADMIN_PASSWORD='UniqueTestPassword#12345';
  const db=new PGlite();
  const run=(sql,params=[])=>!params.length&&sql.includes('CREATE TABLE')?db.exec(sql):db.query(sql,params);
  const adapter={query:run,connect:async()=>({query:run,release(){}})};
  setDatabaseForTests(adapter);
  await migrate();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let cookie='',csrf='';
  async function request(route,method='GET',data){
    const r=await fetch(base+route,{method,headers:{...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(method!=='GET'&&csrf?{'x-kap-csrf':csrf}:{})},body:data?JSON.stringify(data):undefined});
    return {status:r.status,data:await r.json(),headers:r.headers};
  }
  try{
    let r=await request('/api/orders');assert.equal(r.status,401);
    r=await request('/api/login','POST',{email:'owner@kap.example',password:'bad'});assert.equal(r.status,401);
    r=await request('/api/login','POST',{email:'owner@kap.example',password:process.env.KAP_ADMIN_PASSWORD});assert.equal(r.status,200);
    cookie=r.headers.get('set-cookie').split(';')[0];csrf=r.data.csrf;
    r=await request('/api/session');assert.equal(r.status,200);csrf=r.data.csrf;
    r=await request('/api/products');assert.equal(r.data.items.length,3);
    r=await request('/api/orders','POST',{customer:{email:'shopper@example.com',first_name:'Test',last_name:'Klant'},items:[{sku:'essential-zwart-60',quantity:2}]});
    assert.equal(r.status,201);const orderId=r.data.item.id;assert.equal(r.data.item.total_cents,95000);assert.equal(r.data.item.status,'draft');
    r=await request('/api/orders/'+orderId,'PATCH',{status:'shipped',fulfillment_status:'fulfilled'});assert.equal(r.status,409);
    r=await request('/api/orders/'+orderId);assert.equal(r.data.items[0].quantity,2);
    // A signed, duplicate-safe payment event must prepare exactly one durable order email.
    await db.query('UPDATE kap_orders SET external_reference=$1 WHERE id=$2',['test-processor-001',orderId]);
    process.env.KAP_PAYMENT_WEBHOOK_SECRET='IndependentKAPTestWebhookSecret';
    const paymentData=JSON.stringify({event_id:'event-001',external_reference:'test-processor-001',status:'paid',currency:'EUR',amount_cents:95000});
    const timestamp=Date.now();
    const signature=crypto.createHmac('sha256',process.env.KAP_PAYMENT_WEBHOOK_SECRET).update(timestamp+'.'+paymentData).digest('hex');
    const signed=()=>fetch(base+'/api/webhooks/payment',{method:'POST',headers:{'content-type':'application/json','x-kap-timestamp':String(timestamp),'x-kap-signature':signature},body:paymentData});
    assert.equal((await signed()).status,200);
    assert.equal((await signed()).status,200);
    r=await request('/api/orders/'+orderId);
    assert.equal(r.data.item.payment_status,'paid');
    assert.equal(r.data.notifications.length,1);
    assert.equal(r.data.notifications[0].delivery_status,'queued');
    assert.equal(r.data.notifications[0].kind,'order_confirmation');
    r=await request('/api/orders/'+orderId,'PATCH',{status:'shipped',fulfillment_status:'fulfilled',carrier:'PostNL',tracking_code:'TEST-123'});assert.equal(r.status,200);
    r=await request('/api/orders/'+orderId);assert.equal(r.data.notifications.length,2);
    r=await request('/api/customers');assert.equal(r.data.items.length,1);
    r=await request('/api/tickets','POST',{customer_email:'shopper@example.com',subject:'Vraag over montage',priority:'high'});assert.equal(r.status,201);const ticketId=r.data.item.id;
    r=await request('/api/tickets/'+ticketId+'/messages','POST',{direction:'note',body:'Controleer handleiding'});assert.equal(r.status,201);
    r=await request('/api/tickets/'+ticketId+'/messages','POST',{direction:'outbound',body:'Beste klant'});assert.equal(r.status,409);
    r=await request('/api/tickets/'+ticketId);assert.equal(r.data.messages.length,1);assert.equal(r.data.messages[0].direction,'note');
    r=await request('/api/returns','POST',{order_id:orderId,reason:'Past niet'});assert.equal(r.status,201);
    const returnId=r.data.item.id;
    r=await request('/api/returns/'+returnId,'PATCH',{status:'approved',resolution:'refund',notes:'Administratief verzoek'});assert.equal(r.status,200);assert.match(r.data.note,/niet daadwerkelijk/);
    r=await request('/api/team','POST',{name:'KAP Support',email:'support@kap.example',role:'support',password:'TemporarySecurePass#123'});assert.equal(r.status,201);
    r=await request('/api/dashboard');assert.equal(r.status,200);assert.equal(r.data.orders.total,1);assert.equal(r.data.tickets.open,1);
    r=await request('/api/activity');assert.equal(r.status,200);assert.ok(r.data.items.length>=5);
    r=await request('/api/logout','POST',{});assert.equal(r.status,200);
    r=await request('/api/dashboard');assert.equal(r.status,401);
  }finally{await new Promise(resolve=>server.close(resolve));await db.close();delete process.env.KAP_ADMIN_EMAIL;delete process.env.KAP_ADMIN_PASSWORD;delete process.env.KAP_PAYMENT_WEBHOOK_SECRET;}
});
