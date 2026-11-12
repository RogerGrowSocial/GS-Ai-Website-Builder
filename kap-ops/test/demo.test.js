import { test } from 'node:test';
import assert from 'node:assert/strict';

test('free preview runs all read-only dashboards without an external database',async()=>{
  process.env.KAP_DEMO_MODE='true';
  process.env.KAP_ADMIN_EMAIL='studio@kap.example';
  process.env.KAP_ADMIN_PASSWORD='AUniqueLocalTestPassword123!';
  const {server,migrate}=await import('../server.js');
  await migrate();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await fetch(base+'/health')).status,200);
    const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'studio@kap.example',password:process.env.KAP_ADMIN_PASSWORD})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    for(const route of ['/api/dashboard','/api/orders','/api/customers','/api/tickets','/api/returns','/api/products','/api/launch-readiness','/api/activity','/api/config']){
      const response=await fetch(base+route,{headers:{cookie}});
      assert.equal(response.status,200,route);
    }
    const dashboard=await (await fetch(base+'/api/dashboard',{headers:{cookie}})).json();
    assert.equal(dashboard.orders.total,2);
    const config=await (await fetch(base+'/api/config',{headers:{cookie}})).json();
    assert.equal(config.demo_mode,true);
    assert.equal(config.mail_ready,false);
    assert.equal(config.checkout_ready,false);
    const readiness=await (await fetch(base+'/api/launch-readiness',{headers:{cookie}})).json();
    assert.equal(readiness.summary.live,false);
    assert.equal(readiness.products.sellable,0);
    const csrf=(await (await fetch(base+'/api/session',{headers:{cookie}})).json()).csrf;
    const unsafe=await fetch(base+'/api/products',{method:'PATCH',headers:{cookie,'Content-Type':'application/json','X-KAP-CSRF':csrf},body:JSON.stringify({sku:'essential-zwart-60',status:'ready',stock_quantity:5})});
    assert.equal(unsafe.status,409);
    const post=async(route,data)=>{
      const response=await fetch(base+route,{method:'POST',headers:{cookie,'Content-Type':'application/json','X-KAP-CSRF':csrf},body:JSON.stringify(data)});
      return {status:response.status,data:await response.json()};
    };
    const patch=async(route,data)=>{
      const response=await fetch(base+route,{method:'PATCH',headers:{cookie,'Content-Type':'application/json','X-KAP-CSRF':csrf},body:JSON.stringify(data)});
      return {status:response.status,data:await response.json()};
    };
    // Full fictional lifecycle, including sandbox payment and simulated order emails.
    const started=await post('/api/testing/checkout',{sku:'essential-zwart-60',quantity:1});
    assert.equal(started.status,201);
    const id=started.data.item.id;
    let detail=await (await fetch(base+'/api/orders/'+id,{headers:{cookie}})).json();
    assert.equal(detail.item.source,'sandbox');
    assert.equal(detail.item.payment_status,'unpaid');
    assert.equal(detail.notifications.length,0);
    assert.equal((await post('/api/testing/orders/'+id+'/pay',{})).status,200);
    assert.equal((await post('/api/testing/orders/'+id+'/pay',{})).status,200);
    detail=await (await fetch(base+'/api/orders/'+id,{headers:{cookie}})).json();
    assert.equal(detail.item.payment_status,'paid');
    assert.equal(detail.notifications.length,1);
    assert.equal(detail.notifications[0].kind,'order_confirmation');
    assert.equal(detail.notifications[0].delivery_status,'simulated');
    assert.equal(detail.notifications[0].recipient,'testbestelling@voorbeeld.invalid');
    const shipped=await patch('/api/orders/'+id,{status:'shipped',fulfillment_status:'fulfilled',carrier:'KAP Testtransport',tracking_code:'KAP-TEST-0001'});
    assert.equal(shipped.status,200);
    detail=await (await fetch(base+'/api/orders/'+id,{headers:{cookie}})).json();
    assert.equal(detail.notifications.length,2);
    assert.equal(detail.notifications.filter(x=>x.kind==='shipping_confirmation').length,1);
    assert.ok(detail.notifications.every(n=>n.delivery_status==='simulated'));
    assert.equal((await post('/api/tickets',{order_id:id,subject:'Testvraag'})).status,201);
    assert.equal((await post('/api/returns',{order_id:id,reason:'Testretour'})).status,201);
    detail=await (await fetch(base+'/api/orders/'+id,{headers:{cookie}})).json();
    assert.equal(detail.tickets.length,1);
    assert.equal(detail.returns.length,1);
    assert.equal((await post('/api/testing/checkout',{sku:'ongekend',quantity:1})).status,400);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
