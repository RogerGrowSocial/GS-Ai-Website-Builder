import test from 'node:test';
import assert from 'node:assert/strict';
import { CJClient, normalizeCJList } from '../cj-client.js';

function makeFetch(calls, responder = () => ({code:200,result:true,data:{}})) {
  return async (url, options) => {
    calls.push({url,method:options.method,headers:options.headers,body:options.body&&JSON.parse(options.body)});
    return {ok:true,status:200,json:async()=>responder(url,options)};
  };
}

test('CJ search normalizes V2 nested product results and never claims documents are verified', async () => {
  const calls=[];
  const client=new CJClient({apiKey:'CJ_TEST_KEY_SAFE_123456789',fetcher:makeFetch(calls,url =>
    url.endsWith('/authentication/getAccessToken')
      ? {code:200,result:true,data:{accessToken:'test-token',accessTokenExpiryDate:'2099-01-01'}}
      : {code:200,result:true,data:{pageNumber:1,totalRecords:1,content:[{productList:[
          {id:'p123',nameEn:'60cm angled cooker hood',sku:'sku123',bigImage:'https://example.com/p.jpg',nowPrice:'39.99',totalVerifiedInventory:10,hasCECertification:1}
        ]}]}}
  )});
  const r=await client.search('angled cooker hood');
  assert.equal(r.items.length,1);
  assert.equal(r.items[0].pid,'p123');
  assert.equal(r.items[0].ce_claimed,true);
  assert.equal(r.items[0].price_usd,'39.99');
  assert.equal(calls.length,2);
  assert.equal(calls[1].headers['CJ-Access-Token'],'test-token');
  assert.equal(calls[1].url.includes('keyWord=angled+cooker+hood'),true);
  await client.search('range hood');
  assert.equal(calls.filter(x=>x.url.endsWith('/authentication/getAccessToken')).length,1);
});

test('CJ blocks absent API key and injection via arbitrary endpoints', async () => {
  const client=new CJClient({apiKey:'',fetcher:async()=>{throw Error('should not be called')}});
  await assert.rejects(client.search('range hood'),/CJ_API_KEY/);
  const c2=new CJClient({apiKey:'CJ_TEST_KEY_SAFE_123456789',fetcher:async()=>{throw Error('should not be called')}});
  await assert.rejects(c2.http('https://evil.invalid'),/Ongeldige CJ API-route/);
  await assert.rejects(c2.search('x'),/minimaal drie/);
  assert.throws(()=>c2.freight({vid:'valid-id',origin:'INVALID'}),/magazijnlocatie/);
});

test('CJ does not place real orders; sourcing requires public HTTPS images', async () => {
  const calls=[];
  const client=new CJClient({apiKey:'CJ_TEST_KEY_SAFE_123456789',fetcher:makeFetch(calls,url =>
    url.endsWith('getAccessToken')
      ? {code:200,result:true,data:{accessToken:'test-token',accessTokenExpiryDate:'2099-01-01'}}
      : {code:0,success:true,data:{cjSourcingId:'285'}}
  )});
  await assert.rejects(client.createSourcing({productName:'Black angled hood',productImage:'http://127.0.0.1/file.jpg'}),/HTTPS/);
  const result=await client.createSourcing({productName:'Black angled hood',productImage:'https://example.com/hood.jpg',productUrl:'https://example.com/hood',remark:'No logos'});
  assert.equal(result.sourceId,'285');
  assert.equal(calls[1].body.productName,'Black angled hood');
  assert.equal(calls[1].body.price,'');
  assert.equal(calls.filter(x=>/createOrder|payBalance/.test(x.url)).length,0);
});

test('CJ rejects incomplete/malformed API responses', async () => {
  const client=new CJClient({apiKey:'CJ_TEST_KEY_SAFE_123456789',fetcher:makeFetch([],
    () => ({code:1601000,result:false,data:null}))});
  await assert.rejects(client.search('cooker hood'),/CJ wees/);
  assert.deepEqual(normalizeCJList(null),{items:[],total:0,page:1});
});
