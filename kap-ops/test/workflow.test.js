import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
process.env.KAP_TEST_CHECKOUT_ENABLED='true';
const { server, migrate, setDatabaseForTests } = await import('../server.js');

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
    // On the *persistent Postgres* driver, run the complete staff-only checkout.
    // Even if outbound mail is configured later, sandbox messages must not go out.
    process.env.KAP_MAIL_API_KEY='fake-test-only-key';
    process.env.KAP_FROM_EMAIL='orders@kap.example';
    r=await request('/api/testing/checkout','POST',{sku:'essential-rvs-60',quantity:1});
    assert.equal(r.status,201);const sandboxId=r.data.item.id;
    r=await request('/api/testing/orders/latest');assert.equal(r.data.item.id,sandboxId);
    r=await request('/api/testing/orders/'+sandboxId+'/pay','POST',{});assert.equal(r.status,200);
    r=await request('/api/testing/orders/'+sandboxId+'/pay','POST',{});assert.equal(r.status,200);
    r=await request('/api/orders/'+sandboxId);assert.equal(r.data.notifications.length,1);
    assert.equal(r.data.notifications[0].delivery_status,'simulated');
    assert.equal(r.data.item.source,'sandbox');
    r=await request('/api/orders/'+sandboxId,'PATCH',{status:'shipped',fulfillment_status:'fulfilled',carrier:'KAP Testtransport',tracking_code:'TEST-1'});assert.equal(r.status,200);
    r=await request('/api/orders/'+sandboxId);assert.equal(r.data.notifications.length,2);
    assert.ok(r.data.notifications.every(n=>n.delivery_status==='simulated'));
    r=await request('/api/tickets','POST',{order_id:sandboxId,subject:'Testvraag'});assert.equal(r.status,201);
    r=await request('/api/returns','POST',{order_id:sandboxId,reason:'Testretour'});assert.equal(r.status,201);
    r=await request('/api/orders/'+sandboxId);assert.equal(r.data.tickets.length,1);assert.equal(r.data.returns.length,1);
    // Sandbox activity stays visible for QA, but never inflates actual customer value or KPIs.
    r=await request('/api/customers');
    const realCustomer=r.data.items.find(c=>c.email==='shopper@example.com');
    const testCustomer=r.data.items.find(c=>c.email==='testbestelling@voorbeeld.invalid');
    assert.equal(realCustomer.order_count,1);
    assert.equal(realCustomer.lifetime_cents,95000);
    assert.equal(testCustomer.order_count,0);
    assert.equal(testCustomer.lifetime_cents,0);
    assert.equal(testCustomer.has_sandbox_data,true);
    r=await request('/api/tickets');
    assert.equal(r.data.items.find(t=>t.order_id===sandboxId).order_source,'sandbox');
    r=await request('/api/returns');
    assert.equal(r.data.items.find(t=>t.order_id===sandboxId).order_source,'sandbox');
    delete process.env.KAP_MAIL_API_KEY;delete process.env.KAP_FROM_EMAIL;
    r=await request('/api/team','POST',{name:'KAP Support',email:'support@kap.example',role:'support',password:'TemporarySecurePass#123'});assert.equal(r.status,201);
    r=await request('/api/dashboard');assert.equal(r.status,200);assert.equal(r.data.orders.total,1);assert.equal(r.data.tickets.open,1);
    assert.equal(r.data.orders.paid_total,95000); // never count simulated payments as revenue
    assert.equal(r.data.customers.total,1); // exclude the sandbox-only test customer
    r=await request('/api/activity');assert.equal(r.status,200);assert.ok(r.data.items.length>=5);
    r=await request('/api/logout','POST',{});assert.equal(r.status,200);
    r=await request('/api/dashboard');assert.equal(r.status,401);
    // Owner claims a one-time activation link without retaining the generated placeholder login.
    process.env.KAP_SETUP_TOKEN='secure-temporary-activation-token-for-test-only';
    process.env.KAP_SETUP_EMAIL='job@growsocialmedia.nl';
    process.env.KAP_SETUP_EXPIRES_AT=new Date(Date.now()+60_000).toISOString();
    const claim={token:process.env.KAP_SETUP_TOKEN,email:process.env.KAP_SETUP_EMAIL,password:'BrandNewOwnerPassword#2026'};
    r=await request('/api/setup/claim','POST',{...claim,token:'wrong-token'});assert.equal(r.status,403);
    r=await request('/api/setup/claim','POST',claim);assert.equal(r.status,200);
    assert.equal(r.data.user.email,'job@growsocialmedia.nl');
    cookie=r.headers.get('set-cookie').split(';')[0];csrf=r.data.csrf;
    r=await request('/api/profile','PATCH',{name:' '});assert.equal(r.status,400);
    r=await request('/api/profile','PATCH',{name:'Job'});assert.equal(r.status,200);
    assert.equal(r.data.user.name,'Job');
    assert.equal(r.data.user.role,'owner');
    r=await request('/api/session');assert.equal(r.data.user.name,'Job');csrf=r.data.csrf;
    r=await request('/api/dashboard');assert.equal(r.status,200); // signed in automatically
    r=await request('/api/setup/claim','POST',claim);assert.equal(r.status,409); // cannot reuse
    r=await request('/api/logout','POST',{});assert.equal(r.status,200);
    r=await request('/api/login','POST',{email:'owner@kap.example',password:process.env.KAP_ADMIN_PASSWORD});assert.equal(r.status,401);
    r=await request('/api/login','POST',{email:'job@growsocialmedia.nl',password:claim.password});assert.equal(r.status,200);
    assert.equal(r.data.user.name,'Job');
  }finally{await new Promise(resolve=>server.close(resolve));await db.close();for(const k of ['KAP_ADMIN_EMAIL','KAP_ADMIN_PASSWORD','KAP_PAYMENT_WEBHOOK_SECRET','KAP_MAIL_API_KEY','KAP_FROM_EMAIL','KAP_SETUP_TOKEN','KAP_SETUP_EMAIL','KAP_SETUP_EXPIRES_AT'])delete process.env[k];}
});
