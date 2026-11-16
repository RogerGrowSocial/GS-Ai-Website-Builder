import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchReadiness } from '../launch-readiness.js';

test('launch center fails closed with preview data and missing supplier documents',()=>{
  const data=launchReadiness({demo:true,hasPersistentDatabase:false,products:[{sku:'essential-zwart-60',status:'draft',stock_quantity:0}],config:{}});
  assert.equal(data.summary.ready,0);
  assert.equal(data.summary.live,false);
  assert.equal(data.summary.total,11);
  assert.equal(data.products.sellable,0);
  assert.match(data.warning,/gegevens/);
});

test('a stocked product needs an explicit approved SKU to count as sellable',()=>{
  const products=[{sku:'studio-zwart-60',status:'ready',stock_quantity:5}];
  const blocked=launchReadiness({demo:false,hasPersistentDatabase:true,products,config:{approvedSkus:''}});
  assert.equal(blocked.products.sellable,0);
  const approved=launchReadiness({demo:false,hasPersistentDatabase:true,products,config:{approvedSkus:'studio-zwart-60',supplierVerified:true,safetyVerified:true,weeeVerified:true,pricesVerified:true}});
  assert.equal(approved.products.sellable,1);
  assert.equal(approved.summary.live,false);
  assert.ok(approved.summary.blocked>0);
});
