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
  }finally{await new Promise(resolve=>server.close(resolve))}
});
