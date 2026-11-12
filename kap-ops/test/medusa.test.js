import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  medusaConfigured, medusaBaseUrl, medusaAdminRead, medusaPage,
  medusaMoneyToCents, medusaOrderSummary
} from '../medusa-client.js';

const env={KAP_MEDUSA_URL:'https://commerce.kap.example/',KAP_MEDUSA_SECRET_API_KEY:'sk_test_example_not_real'};

test('Medusa integration is opt-in and refuses insecure remote hosts',()=>{
  assert.equal(medusaConfigured({}),false);
  assert.throws(()=>medusaBaseUrl({}),{code:503});
  assert.throws(()=>medusaBaseUrl({...env,KAP_MEDUSA_URL:'http://example.com'}),{code:503});
  assert.throws(()=>medusaBaseUrl({...env,KAP_MEDUSA_URL:'https://example.com/orders'}),{code:503});
  assert.equal(medusaBaseUrl(env).origin,'https://commerce.kap.example');
  assert.equal(medusaBaseUrl({...env,KAP_MEDUSA_URL:'http://localhost:9000'}).port,'9000');
});

test('Medusa API key remains server-only; adapter performs GET requests',async()=>{
  const calls=[];
  const fakeFetch=async(url,init)=>{
    calls.push({url:url.toString(),init});
    return {ok:true,json:async()=>({orders:[{id:'order_1',total:475,currency_code:'eur'}]})};
  };
  const result=await medusaAdminRead('orders',{env,request:fakeFetch});
  assert.equal(result.orders[0].id,'order_1');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://commerce.kap.example/admin/orders?limit=30&offset=0&order=-created_at');
  assert.equal(calls[0].init.method,'GET');
  assert.equal(calls[0].init.headers.Authorization,'Basic '+env.KAP_MEDUSA_SECRET_API_KEY);
  await assert.rejects(medusaAdminRead('write-order',{env,request:fakeFetch}),{code:400});
});

test('Medusa major currency amounts are converted for the KAP. cent-based UI',()=>{
  assert.equal(medusaMoneyToCents(475),47500);
  assert.equal(medusaMoneyToCents(475.55),47555);
  assert.equal(medusaMoneyToCents(-1),null);
  assert.equal(medusaMoneyToCents('475'),null);
  assert.deepEqual(medusaOrderSummary({id:'order_1',total:475.55,currency_code:'eur'}),{
    id:'order_1',display_id:null,email:'',created_at:null,currency:'EUR',total_cents:47555,
    payment_status:'unknown',fulfillment_status:'unknown'
  });
});

test('Medusa failures do not expose upstream error messages or credentials',async()=>{
  const failing=async()=>({ok:false,status:401,json:async()=>({error:'private provider token'})});
  await assert.rejects(medusaAdminRead('products',{env,request:failing}),err=>err.code===502&&!err.message.includes('token'));
  await assert.rejects(medusaAdminRead('products',{env,request:async()=>{throw Error('secret')}}),err=>err.code===502&&!err.message.includes('secret'));
});

test('Medusa pagination rejects invalid offsets and preserves least-privilege access',async()=>{
  assert.equal(medusaPage(0),0);
  assert.equal(medusaPage('30'),30);
  for(const input of [-1,1,2.5,'30x','1e4',null,Infinity,999999,1_000_020]){
    assert.throws(()=>medusaPage(input),{code:400});
  }
  const calls=[];
  const request=async(url,init)=>{
    calls.push({url:String(url),init});
    return {ok:true,json:async()=>({products:[],count:64,limit:30,offset:30})};
  };
  const result=await medusaAdminRead('products',{env,request,offset:30});
  assert.equal(result.count,64);
  assert.equal(calls[0].url,'https://commerce.kap.example/admin/products?limit=30&offset=30');
  assert.equal(calls[0].init.method,'GET');
  await assert.rejects(medusaAdminRead('orders',{env,request,offset:31}),{code:400});
  assert.equal(calls.length,1);
});
